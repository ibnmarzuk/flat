"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPublicClient, custom, encodeFunctionData, formatEther, parseEther, toHex, type Hash } from "viem";
import { useWalletSession } from "@/app/wallet-session";
import { selectWalletNetwork } from "@/lib/wallet-network";
import { TESTNET_CHAIN_ID, TESTNET_CHAIN_HEX, TESTNET_RPC, TESTNET_EXPLORER, TESTNET_FAUCET } from "@/lib/testnet-swap";
import { TRADE_ROUTER, TRADE_TOKEN, TRADE_PAIR, buildTradeData } from "@/lib/testnet-trade";
import { tradeAbi, type TradeQuote, type TradeProof } from "@/lib/testnet-dex";
import SwapHistory from "./swap-history";
import { XP, type XpProgress } from "@/lib/xp-rules";
import styles from "@/app/wif/weekly.module.css";
import xpStyles from "./xp.module.css";

const network = { chainId: TESTNET_CHAIN_HEX, chainName: "Robinhood Chain Testnet", rpcUrl: TESTNET_RPC, explorer: TESTNET_EXPLORER };
const storageKey = (wallet: string) => `flatquest:testnet-swap:${wallet}`;
type Proof = TradeProof;
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
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.000001");
  const [balances, setBalances] = useState<{ wallet: string; eth: string; token: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState({ wallet: "", message: "" });
  const pending = useRef(false);
  const current = loaded?.wallet === wallet ? loaded : null;
  const progress = current?.progress;
  const hash = input.wallet === wallet ? input.hash : "";
  const result = feedback?.wallet === wallet ? feedback : null;
  const testnetSelected = chainId.toLowerCase() === TESTNET_CHAIN_HEX;
  const count = progress?.testnetTradeCount ?? 0;
  const [quote, setQuote] = useState<{ wallet: string; direction: string; amount: string; data?: TradeQuote; error?: string } | null>(null);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const liveQuote = quote?.wallet === wallet && quote.direction === direction && quote.amount === amount ? quote : null;
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
        const [eth, token] = await Promise.all([
          client.getBalance({ address: wallet as `0x${string}` }),
          client.readContract({ address: TRADE_TOKEN, abi: tradeAbi, functionName: "balanceOf", args: [wallet as `0x${string}`] })
        ]);
        if (active && isCurrentWallet(wallet) && await client.getChainId() === TESTNET_CHAIN_ID) {
          setBalances({ wallet, eth: formatEther(eth), token: formatEther(token) });
        }
      } catch { /* MetaMask will check the balance again before sending. */ }
    }
    void readBalances();
    return () => { active = false; };
  }, [wallet, testnetSelected, reload, getWalletProvider, isCurrentWallet]);

  async function fetchQuote(address: string, tradeDirection: "buy" | "sell", value: string, signal?: AbortSignal) {
    const response = await fetch("/api/swap-quote", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: tradeDirection, amount: value }), signal });
    const data = await response.json() as { walletAddress?: string; quote?: TradeQuote; error?: string };
    if (response.status === 401) expireSession(address);
    if (!response.ok || data.walletAddress !== address || !data.quote || data.quote.chainId !== TESTNET_CHAIN_ID ||
      data.quote.direction !== tradeDirection || data.quote.amountIn !== parseEther(value).toString()) throw new Error(data.error || "Unable to quote this swap.");
    return data.quote;
  }

  useEffect(() => {
    if (!wallet || busy) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchQuote(wallet, direction, amount, controller.signal);
        if (!controller.signal.aborted && isCurrentWallet(wallet)) setQuote({ wallet, direction, amount, data });
      } catch (error) {
        if (!controller.signal.aborted && isCurrentWallet(wallet)) setQuote({ wallet, direction, amount,
          error: error instanceof Error ? error.message : "Unable to load a quote." });
      }
    }, 500);
    const refresh = window.setInterval(() => setQuoteRefresh((value) => value + 1), 20_000);
    return () => { controller.abort(); window.clearTimeout(timer); window.clearInterval(refresh); };
    // fetchQuote is tied to the current amount and wallet by this effect's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, direction, amount, busy, quoteRefresh, expireSession, isCurrentWallet]);

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
      throw new Error(data.error || "Unable to verify this swap.");
    }
    setLoaded({ wallet: address, progress: data.progress, proofs: data.proofs });
    setFeedback({ wallet: address, transactionHash: data.transactionHash,
      message: data.alreadyRecorded ? "Already verified. This receipt is in your XP total." : `Testnet swap verified. +${XP.swap} XP earned.` });
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
      const assertWallet = async () => {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== wallet || !isCurrentWallet(wallet)) throw new Error("Your account changed. Verify the selected wallet and retry.");
        if (await client.getChainId() !== TESTNET_CHAIN_ID) throw new Error("Return to Robinhood Chain testnet (46630).");
      };
      await assertWallet();
      const [eth, token] = await Promise.all([
        client.getBalance({ address: account }),
        client.readContract({ address: TRADE_TOKEN, abi: tradeAbi, functionName: "balanceOf", args: [account] })
      ]);
      if (direction === "sell" && token < value) throw new Error("You need more Test LOX. Swap some faucet ETH to Test LOX first.");
      if (eth <= (direction === "buy" ? value : 0n)) throw new Error("Get faucet Test ETH, and leave some for testnet gas.");
      const reviewed = liveQuote?.data;
      if (!reviewed) throw new Error("Wait for a live quote before swapping.");
      if (direction === "sell") {
        const allowance = await client.readContract({ address: TRADE_TOKEN, abi: tradeAbi, functionName: "allowance", args: [account, TRADE_ROUTER] });
        if (allowance < value) {
          await assertWallet();
          setFeedback({ wallet, message: "Approve the exact Test LOX amount in MetaMask, then confirm the swap." });
          const approval = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet, to: TRADE_TOKEN,
            data: encodeFunctionData({ abi: tradeAbi, functionName: "approve", args: [TRADE_ROUTER, value] }),
            value: "0x0", chainId: TESTNET_CHAIN_HEX }] });
          if (typeof approval !== "string" || !/^0x[0-9a-f]{64}$/i.test(approval)) throw new Error("The wallet did not return an approval hash.");
          const approved = await client.waitForTransactionReceipt({ hash: approval as Hash, confirmations: 2, timeout: 90_000, pollingInterval: 2_000 });
          if (approved.status !== "success") throw new Error("Test LOX approval failed.");
        }
      }
      await assertWallet();
      const fresh = await fetchQuote(wallet, direction, amount);
      if (!isCurrentWallet(wallet)) return;
      setQuote({ wallet, direction, amount, data: fresh });
      if (BigInt(fresh.amountOut) < BigInt(reviewed.minimumOut)) throw new Error("The price moved. Review the updated quote and try again.");
      const minimum = BigInt(fresh.minimumOut) > BigInt(reviewed.minimumOut) ? BigInt(fresh.minimumOut) : BigInt(reviewed.minimumOut);
      const data = buildTradeData({ direction, amount: value, minimum, wallet, deadline: BigInt(fresh.deadline) }) as Hash;
      const transaction = { account, to: TRADE_ROUTER, data, value: direction === "buy" ? value : 0n } as const;
      const [gas, gasPrice, availableEth] = await Promise.all([client.estimateGas(transaction), client.getGasPrice(), client.getBalance({ address: account })]);
      if (availableEth < transaction.value + gas * gasPrice * 120n / 100n) throw new Error("Leave more faucet Test ETH for testnet gas.");
      await assertWallet();
      setFeedback({ wallet, message: "Confirm the Test ETH ↔ Test LOX swap in MetaMask…" });
      const sent = await provider.request({ method: "eth_sendTransaction", params: [{
        from: wallet, to: TRADE_ROUTER, data, value: toHex(transaction.value), chainId: TESTNET_CHAIN_HEX
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
      transactionHash = receipt.transactionHash;
      setInput({ wallet, hash: transactionHash });
      try { localStorage.setItem(storageKey(wallet), transactionHash); } catch { /* Optional receipt recovery. */ }
      await recordHash(wallet, transactionHash);
      setReload((value) => value + 1);
    } catch (error) {
      if (isCurrentWallet(wallet)) {
        const code = (error as { code?: number })?.code;
        const message = code === 4001 ? "Wallet request declined. You can try again."
          : transactionHash ? "The transaction was sent. Use its hash below to retry verification after it confirms."
          : (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message : "Unable to send the testnet swap.");
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
      <div><span className={styles.kicker}>TOKEN SWAP · ROBINHOOD CHAIN TESTNET</span>
        <h1>Test a swap.<br />Earn <em>XP.</em></h1>
        <p>Trade faucet Test ETH ↔ Test LOX using a live pool quote. Copy your onchain transaction hash and earn {XP.swap} XP for each verified swap.</p>
      </div>
      <aside className={styles.week} aria-label="Your demo progress">
        <span className={styles.kicker}>YOUR QUEST SCORE</span>
        <div className={`${styles.metrics} ${xpStyles.swapMetrics}`}>
          <div><strong>{progress?.xp ?? "—"}</strong><span>Total XP</span></div>
          <div><strong>{progress ? count : "—"}</strong><span>Testnet token swaps</span></div>
        </div>
        {progress && <div className={xpStyles.target}>
          <label htmlFor="swap-target">{count >= 20 ? "20-swap milestone complete" : `${count} of ${nextMilestone} to your next milestone`}</label>
          <progress id="swap-target" value={Math.min(count, nextMilestone)} max={nextMilestone} />
        </div>}
      </aside>
    </header>
    <div className={xpStyles.demoNotice}>
      <strong>Demo tokens only · Chain ID 46630</strong>
      <p>Test ETH and Test LOX are demo tokens. The Loxley testnet pool quotes a changing exchange rate, with a 0.3% pool fee and 1% slippage protection.</p>
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
          <span className={styles.kicker}>01 / USE YOUR FAUCET ETH</span><h2>Test ETH ↔ Test LOX</h2>
          <p>Use the same wallet you funded from the faucet. MetaMask will switch to Robinhood Chain testnet before you confirm.</p>
          <p className={xpStyles.network}>{testnetSelected ? "● Robinhood Chain testnet selected" : "○ Testnet will be selected before sending"}</p>
          {testnetSelected && balances?.wallet === wallet && <p className={xpStyles.balances}>
            Balance: {balances.eth} Test ETH<br />{balances.token} Test LOX
          </p>}
          <form onSubmit={makeSwap}>
            <label htmlFor="conversion-direction">Swap direction
              <select id="conversion-direction" className={xpStyles.select} value={direction} disabled={!!busy}
                onChange={(event) => { setDirection(event.target.value as "buy" | "sell"); setAmount(event.target.value === "buy" ? "0.000001" : "0.001"); setQuote(null); }}>
                <option value="buy">Test ETH → Test LOX</option>
                <option value="sell">Test LOX → Test ETH</option>
              </select>
            </label>
            <label htmlFor="conversion-amount">Amount of {direction === "buy" ? "Test ETH" : "Test LOX"}
              <input id="conversion-amount" inputMode="decimal" value={amount} disabled={!!busy} maxLength={40}
                onChange={(event) => setAmount(event.target.value)} autoComplete="off" required />
            </label>
            <div className={xpStyles.quote} aria-live="polite">
              {liveQuote?.error ? <p role="alert">{liveQuote.error}</p> : liveQuote?.data ? <>
                <span>Estimated received</span><strong>{formatEther(BigInt(liveQuote.data.amountOut))} {direction === "buy" ? "Test LOX" : "Test ETH"}</strong>
                <small>Minimum received: {formatEther(BigInt(liveQuote.data.minimumOut))} · Slippage: 1%<br />Pool price effect including fee: {(liveQuote.data.priceEffectBps / 100).toFixed(2)}%</small>
              </> : <p>Loading live pool quote…</p>}
            </div>
            <button className="primary-button" type="submit" disabled={!!busy || !liveQuote?.data}>{busy === wallet ? "Working… check MetaMask" : "Swap test tokens ↗"}</button>
          </form>
          <p className={styles.help}><a href={`${TESTNET_EXPLORER}/address/${TRADE_PAIR}`} target="_blank" rel="noreferrer">View testnet liquidity pool ↗</a></p>
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
          <p className={styles.help}>1 verified swap = 1 XP. Five swaps = 5 XP; twenty = 20 XP. Each receipt counts once.</p>
          <p className={styles.help}>Faucet claims, token approvals and wrapping do not count as swaps.</p>
        </section>
      </div>
      {result && <div className={styles.feedback} role={result.error ? "alert" : "status"}>
        <p>{result.message}</p>{result.transactionHash && receiptLinks(result.transactionHash)}
      </div>}
      {!!current?.proofs?.length && <SwapHistory proofs={current.proofs} />}

    </>}
    {copyStatus.wallet === wallet && <p role="status">{copyStatus.message}</p>}
  </div></main>;
}
