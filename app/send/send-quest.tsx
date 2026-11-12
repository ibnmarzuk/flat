"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPublicClient, custom, formatEther, isAddress, parseEther, toHex, type Hash } from "viem";
import { useWalletSession } from "@/app/wallet-session";
import { selectWalletNetwork } from "@/lib/wallet-network";
import { TESTNET_CHAIN_HEX, TESTNET_CHAIN_ID, TESTNET_EXPLORER, TESTNET_FAUCET, TESTNET_RPC } from "@/lib/testnet-swap";
import { TRADE_SYMBOL, TRADE_TOKEN } from "@/lib/testnet-trade";
import { buildTokenTransferData } from "@/lib/testnet-send";
import { tradeAbi } from "@/lib/testnet-dex";
import { XP, type XpProgress } from "@/lib/xp-rules";
import type { TestnetSendHistory } from "@/lib/xp-progress";
import styles from "@/app/wif/weekly.module.css";
import xpStyles from "@/app/swap/xp.module.css";

const network = { chainId: TESTNET_CHAIN_HEX, chainName: "Robinhood Chain Testnet", rpcUrl: TESTNET_RPC, explorer: TESTNET_EXPLORER };
const storageKey = (wallet: string) => `flatquest:testnet-send:${wallet}`;
type Response = { walletAddress?: string; chainId?: number; progress?: XpProgress; proofs?: TestnetSendHistory[];
  transactionHash?: string; alreadyRecorded?: boolean; error?: string };

export default function SendQuest() {
  const { wallet, chainId, setChainId, checkingSession, connecting, connect, retrySeconds,
    getWalletProvider, isCurrentWallet, expireSession, setNotice } = useWalletSession();
  const [progress, setProgress] = useState<XpProgress | null>(null);
  const [proofs, setProofs] = useState<TestnetSendHistory[]>([]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [hash, setHash] = useState("");
  const [balance, setBalance] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const onTestnet = chainId.toLowerCase() === TESTNET_CHAIN_HEX;

  useEffect(() => {
    if (!wallet) { setProgress(null); setProofs([]); setHash(""); return; }
    try { const saved = localStorage.getItem(storageKey(wallet)); if (saved && /^0x[0-9a-f]{64}$/i.test(saved)) setHash(saved); } catch {}
    const controller = new AbortController();
    fetch("/api/testnet-sends", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as Response;
      if (controller.signal.aborted || !isCurrentWallet(wallet)) return;
      if (response.status === 401) expireSession(wallet);
      if (!response.ok || data.walletAddress !== wallet || data.chainId !== TESTNET_CHAIN_ID || !data.progress) throw new Error(data.error || "Unable to load the quest.");
      setProgress(data.progress); setProofs(data.proofs || []);
    }).catch((error) => { if (!controller.signal.aborted) setFeedback(error instanceof Error ? error.message : "Unable to load the quest."); });
    return () => controller.abort();
  }, [wallet, expireSession, isCurrentWallet]);

  useEffect(() => {
    if (!wallet || !onTestnet) return;
    let active = true;
    void (async () => {
      try {
        const provider = await getWalletProvider();
        if (!provider) return;
        const client = createPublicClient({ transport: custom(provider) });
        const value = await client.readContract({ address: TRADE_TOKEN, abi: tradeAbi, functionName: "balanceOf", args: [wallet as `0x${string}`] });
        if (active && isCurrentWallet(wallet)) setBalance(formatEther(value));
      } catch {}
    })();
    return () => { active = false; };
  }, [wallet, onTestnet, getWalletProvider, isCurrentWallet]);

  async function addToken() {
    const provider = await getWalletProvider();
    if (!provider) { setNotice("Open FlatQuest in a browser with MetaMask."); return; }
    try {
      const selected = await selectWalletNetwork(provider, network);
      setChainId(selected);
      if (selected !== TESTNET_CHAIN_HEX) throw new Error("Select Robinhood Chain testnet before adding Test LOX.");
      const accepted = await provider.request({ method: "wallet_watchAsset", params: [{ type: "ERC20", options: {
        address: TRADE_TOKEN, symbol: "tLOX", decimals: 18
      } }] });
      setNotice(accepted === false ? "Test LOX was not added." : "Test LOX is now available in your wallet token list.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your wallet could not add Test LOX automatically. The token address remains visible below."); }
  }

  async function recordHash(transactionHash: string) {
    const response = await fetch("/api/testnet-sends", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: wallet, transactionHash }) });
    const data = await response.json() as Response;
    if (!isCurrentWallet(wallet)) return;
    if (response.status === 401) expireSession(wallet);
    if (!response.ok || data.walletAddress !== wallet || !data.progress || !data.transactionHash) throw new Error(data.error || "Unable to verify this token send.");
    setProgress(data.progress); setProofs(data.proofs || []); setHash(data.transactionHash);
    setFeedback(data.alreadyRecorded ? "This token send is already in your Passport." : `Token send verified. +${XP.testnetSend} XP earned.`);
    try { localStorage.removeItem(storageKey(wallet)); } catch {}
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!wallet || pending.current || !/^0x[0-9a-f]{64}$/i.test(hash.trim())) { setFeedback("Paste a full Robinhood testnet transaction hash."); return; }
    pending.current = true; setBusy(true); setFeedback("Checking the testnet receipt…");
    try { await recordHash(hash.trim()); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to verify this receipt."); }
    finally { pending.current = false; setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!wallet || !progress || pending.current) return;
    pending.current = true; setBusy(true);
    let sentHash: Hash | undefined;
    try {
      const destination = recipient.trim().toLowerCase();
      if (!isAddress(destination) || destination === wallet || destination === TRADE_TOKEN) throw new Error("Enter a different wallet address as the recipient.");
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount)) throw new Error("Enter a positive Test LOX amount with at most 18 decimals.");
      const value = parseEther(amount);
      if (value <= 0n) throw new Error("Enter an amount above zero.");
      const provider = await getWalletProvider();
      if (!provider) throw new Error("Open this page in a browser with MetaMask, then connect your wallet.");
      const selected = await selectWalletNetwork(provider, network); setChainId(selected);
      if (selected !== TESTNET_CHAIN_HEX) throw new Error("Select Robinhood Chain testnet (46630) to continue.");
      const client = createPublicClient({ transport: custom(provider) });
      const assertWallet = async () => {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== wallet || !isCurrentWallet(wallet)) throw new Error("Your wallet account changed. Verify it and retry.");
        if (await client.getChainId() !== TESTNET_CHAIN_ID) throw new Error("Return to Robinhood Chain testnet (46630).");
      };
      await assertWallet();
      const tokenBalance = await client.readContract({ address: TRADE_TOKEN, abi: tradeAbi, functionName: "balanceOf", args: [wallet as `0x${string}`] });
      if (tokenBalance < value) throw new Error("You need more Test LOX. Complete the swap quest first.");
      const data = buildTokenTransferData(destination, value) as Hash;
      const transaction = { account: wallet as `0x${string}`, to: TRADE_TOKEN, data, value: 0n } as const;
      const [gas, gasPrice, eth] = await Promise.all([client.estimateGas(transaction), client.getGasPrice(), client.getBalance({ address: wallet as `0x${string}` })]);
      if (eth < gas * gasPrice * 120n / 100n) throw new Error("Get faucet Test ETH to cover testnet gas.");
      await assertWallet();
      setFeedback("Confirm the Test LOX transfer in MetaMask…");
      const result = await provider.request({ method: "eth_sendTransaction", params: [{
        from: wallet, to: TRADE_TOKEN, data, value: toHex(0n), chainId: TESTNET_CHAIN_HEX
      }] });
      if (typeof result !== "string" || !/^0x[0-9a-f]{64}$/i.test(result)) throw new Error("The wallet did not return a transaction hash.");
      sentHash = result as Hash; setHash(result);
      try { localStorage.setItem(storageKey(wallet), result); } catch {}
      setFeedback("Transaction sent. Waiting for two testnet confirmations…");
      const receipt = await client.waitForTransactionReceipt({ hash: sentHash, confirmations: 2, timeout: 90_000, pollingInterval: 2_000 });
      if (receipt.status !== "success") throw new Error("The Test LOX transfer failed.");
      sentHash = receipt.transactionHash; setHash(sentHash);
      await recordHash(sentHash);
    } catch (error) {
      const code = (error as { code?: number })?.code;
      setFeedback(code === 4001 ? "Wallet request declined. You can try again."
        : sentHash ? "The transaction was sent. Keep the hash below and retry verification after it confirms."
        : (error instanceof Error ? error.message : "Unable to send Test LOX."));
    } finally { pending.current = false; setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Transaction hash copied."); }
    catch { setNotice("Select the full hash and copy it manually."); }
  }

  return <main className={styles.page}><div className={styles.shell}>
    <nav className={styles.nav}><Link href="/#quests">← Quest board</Link><Link href="/dashboard">WIF Passport & XP ↗</Link></nav>
    <header className={styles.hero}><div><span className={styles.kicker}>TOKEN COURIER · ROBINHOOD CHAIN TESTNET</span>
      <h1>Send a token.<br/>Prove <em>community.</em></h1>
      <p>Send faucet-funded {TRADE_SYMBOL} to another wallet, keep the explorer proof, and earn {XP.testnetSend} XP.</p></div>
      <aside className={styles.week}><span className={styles.kicker}>YOUR QUEST SCORE</span><div className={styles.metrics}>
        <div><strong>{progress?.xp ?? "—"}</strong><span>Total XP</span></div><div><strong>{progress?.testnetSendCount ?? "—"}</strong><span>Verified sends</span></div>
      </div></aside></header>
    <div className={xpStyles.demoNotice}><strong>Demo tokens only · no real money</strong><p>Test LOX is an independent Robinhood testnet demo token, not $WIF and not a stablecoin.</p>
      <div className={styles.actions}><Link href="/swap">Get Test LOX through the swap quest ↗</Link><a href={TESTNET_FAUCET} target="_blank" rel="noreferrer">Get faucet Test ETH ↗</a><button className={styles.secondary} type="button" onClick={() => void addToken()}>Add Test LOX to wallet</button></div>
      <code className="token-address">{TRADE_TOKEN}</code></div>
    {checkingSession ? <p role="status">Checking wallet session…</p> : !wallet ? <section className={styles.connect}><div><h2>Start with your wallet</h2><p>Verify the wallet holding your test tokens.</p></div>
      <button className="primary-button" onClick={() => void connect()} disabled={connecting || !!retrySeconds}>{connecting ? "Connecting…" : "Verify wallet ↗"}</button></section> : !progress ? <p role={feedback ? "alert" : "status"}>{feedback || "Loading token quest…"}</p> : <>
      <div className={styles.steps}>
        <section className={styles.panel}><span className={styles.kicker}>01 / ACT</span><h2>Send Test LOX</h2><p>Use a second wallet or a friend’s testnet wallet. Never send real assets for this quest.</p>
          <p className={xpStyles.network}>{onTestnet ? "● Robinhood Chain testnet selected" : "○ Testnet will be selected before sending"}</p>{onTestnet && <p>Balance: {balance || "…"} Test LOX</p>}
          <form onSubmit={send}><label htmlFor="send-recipient">Recipient wallet<input id="send-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" maxLength={42} spellCheck={false} required /></label>
            <label htmlFor="send-amount">Amount of Test LOX<input id="send-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" maxLength={40} required /></label>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Working… check MetaMask" : "Send test token ↗"}</button></form>
        </section>
        <section className={styles.panel}><span className={styles.kicker}>02 / PROVE</span><h2>Verify and claim {XP.testnetSend} XP</h2><p>The verifier checks the official Test LOX contract, sender, recipient, amount, block inclusion and two confirmations.</p>
          <form onSubmit={verify}><label htmlFor="send-hash">Testnet transaction hash<input id="send-hash" value={hash} onChange={(event) => setHash(event.target.value)} placeholder="0x…" maxLength={66} spellCheck={false} required /></label>
            <div className={styles.actions}><button className="primary-button" disabled={busy} type="submit">{busy ? "Checking…" : "Verify send & claim XP ↗"}</button>{/^0x[0-9a-f]{64}$/i.test(hash) && <button className={styles.secondary} type="button" onClick={() => void copy(hash)}>Copy hash</button>}</div></form>
        </section>
      </div>
      {feedback && <div className={styles.feedback} role="status"><p>{feedback}</p>{/^0x[0-9a-f]{64}$/i.test(hash) && <div className={xpStyles.receipt}><code>{hash}</code><a href={`${TESTNET_EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">View on testnet explorer ↗</a></div>}</div>}
      {!!proofs.length && <section className={styles.history}><span className={styles.kicker}>PASSPORT PROOFS</span><h2>Your verified token sends</h2>{proofs.map((proof) => <article className={xpStyles.historyReceipt} key={proof.transactionHash}><strong>{formatEther(BigInt(proof.amount))} Test LOX</strong><p>To {proof.recipient}</p><a href={`${TESTNET_EXPLORER}/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">{proof.transactionHash} ↗</a><small>Block {proof.blockNumber} · {proof.confirmations} confirmations</small></article>)}</section>}
    </>}
  </div></main>;
}
