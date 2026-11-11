"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPublicClient, custom, encodeFunctionData, formatEther, parseAbi, parseEther, toHex, type Hash } from "viem";
import { useWalletSession } from "@/app/wallet-session";
import { selectWalletNetwork } from "@/lib/wallet-network";
import { TESTNET_CHAIN_ID, TESTNET_CHAIN_HEX, TESTNET_RPC, TESTNET_EXPLORER, TESTNET_FAUCET, TESTNET_WETH } from "@/lib/testnet-swap";
import { XP, type XpProgress } from "@/lib/xp-rules";
import styles from "@/app/wif/weekly.module.css";
import xpStyles from "./xp.module.css";

const wethAbi = parseAbi([
  "function deposit() payable", "function withdraw(uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)"
]);
const network = { chainId: TESTNET_CHAIN_HEX, chainName: "Robinhood Chain Testnet", rpcUrl: TESTNET_RPC, explorer: TESTNET_EXPLORER };
const storageKey = (wallet: string) => `flatquest:testnet-swap:${wallet}`;
type Proof = { transactionHash: string; direction: "wrap" | "unwrap"; amount: string };
type XpResponse = { walletAddress?: string; chainId?: number; progress?: XpProgress; proofs?: Proof[];
  transactionHash?: string; alreadyRecorded?: boolean; error?: string };
type WalletProgress = { wallet: string; progress?: XpProgress; proofs?: Proof[]; error?: string };
type Feedback = { wallet: string; message: string; transactionHash?: string; error?: boolean };

export default function SwapQuest() {
  const { wallet, chainId, setChainId, checkingSession, connecting, connect, notice, retrySeconds,
    getWalletProvider, isCurrentWallet, expireSession } = useWalletSession();
  const [loaded, setLoaded] = useState<WalletProgress | null>(null);
  const [reload, setReload] = useState(0);
  const [input, setInput] = useState({ wallet: "", hash: "" });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState("");
  const [direction, setDirection] = useState<"wrap" | "unwrap">("wrap");
  const [amount, setAmount] = useState("0.0001");
  const [balances, setBalances] = useState<{ wallet: string; eth: string; weth: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState({ wallet: "", message: "" });
  const pending = useRef(false);
  const current = loaded?.wallet === wallet ? loaded : null;
  const progress = current?.progress;
  const hash = input.wallet === wallet ? input.hash : "";
  const result = feedback?.wallet === wallet ? feedback : null;
  const testnetSelected = chainId.toLowerCase() === TESTNET_CHAIN_HEX;
  const count = progress?.testnetSwapCount ?? 0;
  const nextMilestone = count < 5 ? 5 : 20;

  useEffect(() => {
    if (!wallet) return;
    try {
      const saved = localStorage.getItem(storageKey(wallet));
      if (saved && /^0x[0-9a-f]{64}$/i.test(saved)) setInput({ wallet, hash: saved });
    } catch { /* Receipt verification also works without browser storage. */ }
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    async function loadProgress() {
      try {
        const response = await fetch("/api/testnet-swaps", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as XpResponse;
        if (controller.signal.aborted || !isCurrentWallet(wallet)) return;
        if (response.status === 401) expireSession(wallet);
        if (!response.ok || data.walletAddress !== wallet || data.chainId !== TESTNET_CHAIN_ID || !data.progress) {
          throw new Error(data.error || "Demo XP is temporarily unavailable.");
        }
        setLoaded({ wallet, progress: data.progress, proofs: data.proofs });
      } catch (error) {
        if (!controller.signal.aborted && isCurrentWallet(wallet)) {
          setLoaded({ wallet, error: error instanceof Error ? error.message : "Unable to load demo XP." });
        }
      }
    }
    void loadProgress();
    return () => controller.abort();
  }, [wallet, reload, expireSession, isCurrentWallet]);

  useEffect(() => {
    if (!wallet || !testnetSelected) return;
    let active = true;
    async function readBalances() {
      try {
        const provider = await getWalletProvider();
        if (!provider) return;
        const client = createPublicClient({ transport: custom(provider) });
        if (await client.getChainId() !== TESTNET_CHAIN_ID) return;
        const [eth, weth] = await Promise.all([
          client.getBalance({ address: wallet as `0x${string}` }),
          client.readContract({ address: TESTNET_WETH, abi: wethAbi, functionName: "balanceOf", args: [wallet as `0x${string}`] })
        ]);
        if (active && isCurrentWallet(wallet) && await client.getChainId() === TESTNET_CHAIN_ID) {
          setBalances({ wallet, eth: formatEther(eth), weth: formatEther(weth) });
        }
      } catch { /* MetaMask will check the balance again before sending. */ }
    }
    void readBalances();
    return () => { active = false; };
  }, [wallet, testnetSelected, reload, getWalletProvider, isCurrentWallet]);

  async function copyHash(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus({ wallet, message: "Transaction hash copied." });
    } catch {
      setCopyStatus({ wallet, message: "Select the full hash below and copy it manually." });
    }
  }

  async function recordHash(address: string, transactionHash: string) {
    const response = await fetch("/api/testnet-swaps", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address, transactionHash }) });
    const data = await response.json() as XpResponse;
    if (!isCurrentWallet(address)) return;
    if (response.status === 401) expireSession(address);
    if (!response.ok || data.walletAddress !== address || data.chainId !== TESTNET_CHAIN_ID || !data.progress || !data.transactionHash) {
      throw new Error(data.error || "Unable to verify this conversion.");
    }
    setLoaded({ wallet: address, progress: data.progress, proofs: data.proofs });
    setFeedback({ wallet: address, transactionHash: data.transactionHash,
      message: data.alreadyRecorded ? "Already verified. This receipt is in your XP total." : `Testnet conversion verified. +${XP.swap} XP earned.` });
    try { localStorage.removeItem(storageKey(address)); } catch { /* Optional local recovery. */ }
  }

  async function verifySwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !progress || pending.current) return;
    const transactionHash = hash.trim();
    if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) {
      setFeedback({ wallet, message: "Paste the full 0x testnet transaction hash.", error: true });
      return;
    }
    pending.current = true;
    setBusy(wallet);
    try { await recordHash(wallet, transactionHash); }
    catch (error) {
      if (isCurrentWallet(wallet)) setFeedback({ wallet, transactionHash,
        message: error instanceof Error ? error.message : "Unable to verify the receipt.", error: true });
    } finally { pending.current = false; setBusy(""); }
  }

  async function makeSwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !progress || pending.current) return;
    pending.current = true;
    setBusy(wallet);
    let transactionHash: Hash | undefined;
    try {
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount)) throw new Error("Enter a positive amount with at most 18 decimal places.");
      const value = parseEther(amount);
      if (value <= 0n) throw new Error("Enter an amount above zero.");
      const provider = await getWalletProvider();
      if (!provider) throw new Error("Open this page in a browser with MetaMask, then connect your wallet.");
      setFeedback({ wallet, message: "Select Robinhood Chain testnet in your wallet…" });
      const selectedChain = await selectWalletNetwork(provider, network);
      setChainId(selectedChain);
      if (selectedChain !== TESTNET_CHAIN_HEX) throw new Error("Select Robinhood Chain testnet (46630) to continue.");
      const client = createPublicClient({ transport: custom(provider) });
      const account = wallet as `0x${string}`;
      const data = direction === "wrap" ? encodeFunctionData({ abi: wethAbi, functionName: "deposit" })
        : encodeFunctionData({ abi: wethAbi, functionName: "withdraw", args: [value] });
      const transaction = { account, to: TESTNET_WETH, data, value: direction === "wrap" ? value : 0n } as const;
      const [eth, weth] = await Promise.all([
        client.getBalance({ address: account }),
        client.readContract({ address: TESTNET_WETH, abi: wethAbi, functionName: "balanceOf", args: [account] })
      ]);
      if (direction === "unwrap" && weth < value) throw new Error("You need more Test WETH. Wrap some faucet ETH first.");
      if (eth <= transaction.value) throw new Error("Get faucet Test ETH first, and leave a little for testnet gas.");
      const [gas, gasPrice] = await Promise.all([client.estimateGas(transaction), client.getGasPrice()]);
      if (eth < transaction.value + gas * gasPrice * 120n / 100n) throw new Error("Get faucet Test ETH first, and leave a little for testnet gas.");
      const accounts = await provider.request({ method: "eth_accounts" });
      if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== wallet || !isCurrentWallet(wallet)) {
        throw new Error("Your wallet account changed. Verify the selected account and retry.");
      }
      if (await client.getChainId() !== TESTNET_CHAIN_ID) throw new Error("Your network changed. Return to Robinhood Chain testnet.");
      setFeedback({ wallet, message: "Confirm the faucet-token conversion in MetaMask…" });
      const sent = await provider.request({ method: "eth_sendTransaction", params: [{
        from: wallet, to: TESTNET_WETH, data, value: toHex(transaction.value), chainId: TESTNET_CHAIN_HEX
      }] });
      if (typeof sent !== "string" || !/^0x[0-9a-f]{64}$/i.test(sent)) throw new Error("The wallet did not return a valid transaction hash.");
      transactionHash = sent as Hash;
      try { localStorage.setItem(storageKey(wallet), sent); } catch { /* The visible hash remains copyable. */ }
      if (!isCurrentWallet(wallet)) return;
      setInput({ wallet, hash: sent });
      setFeedback({ wallet, transactionHash: sent, message: "Transaction sent. Waiting for two testnet confirmations…" });
      const receipt = await client.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: 90_000,
        pollingInterval: 2_000 });
      if (!isCurrentWallet(wallet)) return;
      if (receipt.status !== "success") throw new Error("The transaction failed. No swap XP was awarded.");
      await recordHash(wallet, transactionHash);
      setReload((value) => value + 1);
    } catch (error) {
      if (isCurrentWallet(wallet)) {
        const code = (error as { code?: number })?.code;
        const message = code === 4001 ? "Wallet request declined. You can try again."
          : transactionHash ? "The transaction was sent. Use its hash below to retry verification after it confirms."
          : (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message : "Unable to send the testnet conversion.");
        setFeedback({ wallet, transactionHash, message, error: true });
      }
    } finally { pending.current = false; setBusy(""); }
  }

  function receiptLinks(transactionHash: string) {
    return <div className={xpStyles.receipt}>
      <code>{transactionHash}</code>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => void copyHash(transactionHash)}>Copy hash</button>
        <a href={`${TESTNET_EXPLORER}/tx/${transactionHash}`} target="_blank" rel="noreferrer">View on testnet explorer ↗</a>
      </div>
    </div>;
  }

  return <main className={styles.page}><div className={styles.shell}>
    <nav className={styles.nav} aria-label="Swap quest navigation">
      <Link href="/#quests">← Quest board</Link><Link href="/dashboard" prefetch={false}>XP leaderboard ↗</Link>
    </nav>
    <header className={styles.hero}>
      <div><span className={styles.kicker}>FAUCET DEMO · ROBINHOOD CHAIN TESTNET</span>
        <h1>Test a swap.<br />Earn <em>XP.</em></h1>
        <p>Convert faucet Test ETH ↔ Test WETH at 1:1. Copy your onchain transaction hash and earn {XP.swap} XP for each verified conversion.</p>
      </div>
      <aside className={styles.week} aria-label="Your demo progress">
        <span className={styles.kicker}>YOUR QUEST SCORE</span>
        <div className={`${styles.metrics} ${xpStyles.swapMetrics}`}>
          <div><strong>{progress?.xp ?? "—"}</strong><span>Total XP</span></div>
          <div><strong>{progress ? count : "—"}</strong><span>Testnet conversions</span></div>
        </div>
        {progress && <div className={xpStyles.target}>
          <label htmlFor="swap-target">{count >= 20 ? "20-conversion milestone complete" : `${count} of ${nextMilestone} to your next milestone`}</label>
          <progress id="swap-target" value={Math.min(count, nextMilestone)} max={nextMilestone} />
        </div>}
      </aside>
    </header>
    <div className={xpStyles.demoNotice}>
      <strong>Demo tokens only · Chain ID 46630</strong>
      <p>Test ETH and Test WETH have no monetary value. This demo uses wrapping and unwrapping, with a fixed 1:1 conversion.</p>
      <a href={TESTNET_FAUCET} target="_blank" rel="noreferrer">Get free Test ETH from the Robinhood faucet ↗</a>
    </div>
    {notice && <p className={styles.feedback} role="status">{notice}</p>}
    {checkingSession ? <p role="status">Checking wallet session…</p> : !wallet ? <section className={styles.connect}>
      <div><h2>Start with your wallet</h2><p>Connect and verify to save receipts and unlock {XP.connectWallet + XP.verifyWallet} starter XP.</p></div>
      <button className="primary-button" onClick={connect} disabled={connecting || retrySeconds > 0}>
        {connecting ? "Connecting…" : retrySeconds ? `Retry in ${retrySeconds}s` : "Verify wallet ↗"}
      </button>
    </section> : current?.error ? <section className={styles.panel}>
      <p role="alert">{current.error}</p><button className={styles.secondary} onClick={() => setReload((value) => value + 1)}>Reload XP</button>
    </section> : !progress ? <p role="status">Loading demo progress…</p> : <>
      <div className={styles.steps}>
        <section className={styles.panel}>
          <span className={styles.kicker}>01 / USE YOUR FAUCET ETH</span><h2>Test ETH ↔ Test WETH</h2>
          <p>Use the same wallet you funded from the faucet. MetaMask will switch to Robinhood Chain testnet before you confirm.</p>
          <p className={xpStyles.network}>{testnetSelected ? "● Robinhood Chain testnet selected" : "○ Testnet will be selected before sending"}</p>
          {testnetSelected && balances?.wallet === wallet && <p className={xpStyles.balances}>
            Balance: {balances.eth} Test ETH<br />{balances.weth} Test WETH
          </p>}
          <form onSubmit={makeSwap}>
            <label htmlFor="conversion-direction">Convert
              <select id="conversion-direction" className={xpStyles.select} value={direction} disabled={!!busy}
                onChange={(event) => setDirection(event.target.value as "wrap" | "unwrap")}>
                <option value="wrap">Test ETH → Test WETH (wrap)</option>
                <option value="unwrap">Test WETH → Test ETH (unwrap)</option>
              </select>
            </label>
            <label htmlFor="conversion-amount">Amount of {direction === "wrap" ? "Test ETH" : "Test WETH"}
              <input id="conversion-amount" inputMode="decimal" value={amount} disabled={!!busy} maxLength={40}
                onChange={(event) => setAmount(event.target.value)} autoComplete="off" required />
            </label>
            <p className={styles.help}>You receive {amount || "0"} {direction === "wrap" ? "Test WETH" : "Test ETH"}. Leave some faucet ETH for testnet gas.</p>
            <button className="primary-button" type="submit" disabled={!!busy}>{busy === wallet ? "Working… check MetaMask" : "Convert test tokens ↗"}</button>
          </form>
          <p className={styles.help}><a href={`${TESTNET_EXPLORER}/address/${TESTNET_WETH}`} target="_blank" rel="noreferrer">Test WETH contract ↗</a></p>
        </section>
        <section className={styles.panel}>
          <span className={styles.kicker}>02 / KEEP YOUR ONCHAIN PROOF</span><h2>Verify and claim {XP.swap} XP</h2>
          <p>Your hash appears here as soon as you send. XP is saved automatically after two confirmations. You can also paste a previous demo hash.</p>
          <form onSubmit={verifySwap}>
            <label htmlFor="swap-hash">Testnet transaction hash
              <input id="swap-hash" value={hash} onChange={(event) => setInput({ wallet, hash: event.target.value })}
                placeholder="0x…" autoComplete="off" spellCheck={false} maxLength={66} required />
            </label>
            <div className={styles.actions}>
              <button className="primary-button" type="submit" disabled={!!busy}>{busy === wallet ? "Checking…" : "Verify hash & claim XP ↗"}</button>
              {/^0x[0-9a-f]{64}$/i.test(hash) && <button type="button" className={styles.secondary} onClick={() => void copyHash(hash)}>Copy hash</button>}
            </div>
          </form>
          <p className={styles.help}>1 verified conversion = 1 XP. Five conversions = 5 XP; twenty = 20 XP. Each receipt counts once.</p>
          <p className={styles.help}>Faucet claims and ordinary token transfers do not count as conversions.</p>
        </section>
      </div>
      {result && <div className={styles.feedback} role={result.error ? "alert" : "status"}>
        <p>{result.message}</p>{result.transactionHash && receiptLinks(result.transactionHash)}
      </div>}
      {!!current?.proofs?.length && <section className={styles.history} aria-label="Your verified testnet receipts">
        <span className={styles.kicker}>SAVED ONCHAIN PROOF</span><h2>Your latest testnet conversions</h2>
        {current.proofs.map((proof) => <article className={xpStyles.historyReceipt} key={proof.transactionHash}>
          <p><strong>{proof.direction === "wrap" ? "Wrapped" : "Unwrapped"} {formatEther(BigInt(proof.amount))}</strong> · +{XP.swap} XP verified</p>
          {receiptLinks(proof.transactionHash)}
        </article>)}
      </section>}
    </>}
    {copyStatus.wallet === wallet && <p role="status">{copyStatus.message}</p>}
  </div></main>;
}
