"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { encodeFunctionData, formatUnits, getAddress, isAddress, maxUint256, parseUnits } from "viem";
import { useWalletSession } from "../wallet-session";
import {
  getWifWeek, isWifRecipient, WIF_CHAIN_HEX, WIF_DECIMALS, WIF_EXPLORER, WIF_RPC_URL, WIF_TOKEN
} from "@/lib/weekly-wif";
import { selectWalletNetwork } from "@/lib/wallet-network";
import type { WifProgress } from "@/lib/wif-progress";
import styles from "./weekly.module.css";

const transferAbi = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "success", type: "bool" }]
}] as const;

const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const closeDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC"
});
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

type ProgressResponse = {
  walletAddress?: string;
  progress?: WifProgress;
  alreadyCompleted?: boolean;
  error?: string;
};

export default function WeeklyWifQuest({ initialWeek }: { initialWeek: ReturnType<typeof getWifWeek> }) {
  const {
    wallet, chainId, checkingSession, connecting, retrySeconds, connect,
    getWalletProvider, setChainId, isCurrentWallet, expireSession, setNotice
  } = useWalletSession();

  const [week, setWeek] = useState(initialWeek);
  const [status, setStatus] = useState<{ wallet: string; progress: WifProgress } | null>(null);
  const [statusError, setStatusError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [hash, setHash] = useState("");
  const [sentHash, setSentHash] = useState("");
  const [busy, setBusy] = useState<"network" | "transfer" | "proof" | null>(null);
  const actionPending = useRef(false);
  const progress = status?.wallet === wallet ? status.progress : null;
  const proof = progress?.currentProof?.weekStart === week.start ? progress.currentProof : null;
  const onMainnet = chainId.toLowerCase() === WIF_CHAIN_HEX;

  useEffect(() => {
    const timer = window.setTimeout(() => setWeek(getWifWeek()), Math.max(0, Date.parse(week.end) - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [week.end]);

  useEffect(() => {
    setRecipient("");
    setAmount("");
    setHash("");
    setSentHash("");
  }, [wallet, week.start]);

  useEffect(() => {
    setStatus(null);
    setStatusError("");
    if (!wallet) return;
    const controller = new AbortController();
    fetch("/api/wif-weekly", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as ProgressResponse;
        if (controller.signal.aborted || !isCurrentWallet(wallet)) return;
        if (response.status === 401) { expireSession(wallet); return; }
        if (!response.ok || !result.progress || result.walletAddress !== wallet) {
          throw new Error(result.error || "Could not load your weekly progress.");
        }
        setStatus({ wallet, progress: result.progress });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatusError("Progress is unavailable. Refresh to try again.");
      });
    return () => controller.abort();
  }, [wallet, week.start, isCurrentWallet, expireSession]);

  function begin(action: NonNullable<typeof busy>) {
    if (!isCurrentWallet(wallet) || actionPending.current) return false;
    actionPending.current = true;
    setBusy(action);
    return true;
  }

  function finish() {
    actionPending.current = false;
    setBusy(null);
  }

  function walletError(error: unknown, fallback: string) {
    const code = (error as { code?: number } | null)?.code;
    if (code === 4001) return "Request declined in your wallet.";
    if (code === -32002) return "Open your wallet to review the pending request.";
    return fallback;
  }

  async function switchNetwork() {
    if (!begin("network")) return;
    try {
      const provider = await getWalletProvider();
      if (!provider) { setNotice("Open FlatQuest in a browser with MetaMask or another Ethereum wallet."); return; }
      const selectedChain = await selectWalletNetwork(provider, {
        chainId: WIF_CHAIN_HEX,
        chainName: "Robinhood Chain",
        rpcUrl: WIF_RPC_URL,
        explorer: WIF_EXPLORER
      });
      setChainId(selectedChain);
      setNotice(selectedChain === WIF_CHAIN_HEX
        ? "Robinhood Chain mainnet selected."
        : "Select Robinhood Chain mainnet in your wallet to continue.");
    } catch (error) {
      setNotice(walletError(error, "Could not switch to Robinhood Chain. Try again."));
    } finally {
      finish();
    }
  }

  async function sendTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onMainnet || proof || sentHash || !progress || !begin("transfer")) return;
    try {
      const to = recipient.trim();
      if (!isAddress(to) || !isWifRecipient(to, wallet)) {
        setNotice("Enter a valid recipient wallet address different from your own.");
        return;
      }
      const enteredAmount = amount.trim();
      if (!/^\d{1,78}(?:\.\d{1,18})?$/.test(enteredAmount)) {
        setNotice("Enter a WIF amount with up to 18 decimal places.");
        return;
      }
      const units = parseUnits(enteredAmount, WIF_DECIMALS);
      if (units <= 0n || units > maxUint256) {
        setNotice("Enter a valid amount greater than zero.");
        return;
      }

      const provider = await getWalletProvider();
      if (!provider) { setNotice("Connect a browser wallet to review the transfer."); return; }
      const [accounts, currentChain] = await Promise.all([
        provider.request({ method: "eth_accounts" }),
        provider.request({ method: "eth_chainId" })
      ]);
      if (!isCurrentWallet(wallet) || !Array.isArray(accounts) || typeof accounts[0] !== "string" ||
          accounts[0].toLowerCase() !== wallet || String(currentChain).toLowerCase() !== WIF_CHAIN_HEX) {
        setNotice("Select your verified wallet on Robinhood Chain mainnet and try again.");
        return;
      }
      const tx = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet,
          to: WIF_TOKEN,
          value: "0x0",
          data: encodeFunctionData({ abi: transferAbi, functionName: "transfer", args: [getAddress(to), units] })
        }]
      });
      if (!isCurrentWallet(wallet)) return;
      if (typeof tx !== "string" || !HASH_PATTERN.test(tx)) {
        setNotice("Check your wallet activity for the transfer hash.");
        return;
      }
      setSentHash(tx);
      setHash(tx);
      setNotice("Transfer submitted. Wait for two confirmations, then verify the hash.");
    } catch (error) {
      setNotice(walletError(error, "The wallet could not prepare the transfer. Check your WIF and ETH balances."));
    } finally {
      finish();
    }
  }

  async function verifyProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progress || !begin("proof")) return;
    try {
      const transactionHash = hash.trim();
      if (!HASH_PATTERN.test(transactionHash)) {
        setNotice("Paste the 0x transaction hash from your wallet.");
        return;
      }
      const response = await fetch("/api/wif-weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash, walletAddress: wallet })
      });
      const result = await response.json() as ProgressResponse;
      if (!isCurrentWallet(wallet)) return;
      if (response.status === 401) expireSession(wallet);
      if (!response.ok || !result.progress || result.walletAddress !== wallet) {
        setNotice(result.error || "WIF proof could not be verified. Try again.");
        return;
      }
      setStatus({ wallet, progress: result.progress });
      setStatusError("");
      setNotice(result.alreadyCompleted ? "Your milestone for this week is already saved." : "Transfer verified. Your weekly milestone is saved.");
    } catch {
      setNotice("WIF proof could not be verified. Try again.");
    } finally {
      finish();
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(new URL("/wif", window.location.origin).href);
      setNotice("Quest link copied. Share it with the recipient so they can pass WIF forward.");
    } catch {
      setNotice("Copy the quest link from your browser’s address bar.");
    }
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Quest navigation">
        <Link href="/#quests">← Quest board</Link>
        <Link href="/dashboard" prefetch={false}>My dashboard ↗</Link>
      </nav>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>WEEKLY COMMUNITY QUEST</span>
          <h1>Pass $WIF<br /><em>forward.</em></h1>
          <p>Send WIF to someone you want to bring into the community. Verify your transfer, share the quest with them, and come back next week to keep your streak going.</p>
        </div>
        <aside className={styles.week}>
          <span className={styles.kicker}>ROBINHOOD CHAIN MAINNET · 4663</span>
          <h2>Week of {shortDate.format(new Date(week.start))}</h2>
          <p>Closes {closeDate.format(new Date(week.end))} UTC.</p>
          <div className={styles.metrics}>
            <div><strong>{progress?.streak ?? "—"}</strong><span>Week streak</span></div>
            <div><strong>{progress?.totalWeeks ?? "—"}</strong><span>Weeks verified</span></div>
          </div>
        </aside>
      </header>

      <section className={styles.info} aria-labelledby="wif-quick-start">
        <div>
          <span className={styles.kicker}>JUDGE QUICK START</span>
          <h2 id="wif-quick-start">Three steps to a verified loop.</h2>
          <ol>
            <li><strong>Verify your wallet</strong> on Robinhood Chain mainnet.</li>
            <li><strong>Send any positive WIF amount</strong> to a different wallet. Mainnet gas and WIF are required.</li>
            <li><strong>Paste the transaction hash</strong> after two confirmations, then share the quest link.</li>
          </ol>
        </div>
        <div className={styles.infoLinks}>
          <span>Official WIF contract</span>
          <a href={`${WIF_EXPLORER}/address/${WIF_TOKEN}`} target="_blank" rel="noreferrer">{WIF_TOKEN.slice(0, 10)}…{WIF_TOKEN.slice(-8)} ↗</a>
          <span>Need a no-cost judge demo?</span>
          <Link href="/swap" prefetch={false}>Use the Robinhood testnet swap quest ↗</Link>
        </div>
      </section>

      <p className={styles.exampleLink}><Link href="/wif/example">Check a real $WIF receipt ↗</Link></p>
      {statusError && <p role="status" className={styles.feedback}>{statusError}</p>}
      {checkingSession ? <p role="status" className={styles.feedback}>Checking wallet session…</p>
        : !wallet ? <section className={styles.connect}>
          <div><h2>Start with your wallet</h2><p>Verify your wallet to save a weekly milestone and see your streak. Never share a private key or recovery phrase.</p></div>
          <button className="primary-button" onClick={connect} disabled={connecting || retrySeconds > 0}>
            {connecting ? "Connecting…" : retrySeconds ? `Retry in ${retrySeconds}s` : "Verify wallet ↗"}
          </button>
        </section>
        : proof ? <section className={styles.complete}>
          <span className={styles.kicker}>✓ WEEKLY PROOF VERIFIED</span>
          <h2>You passed WIF forward.</h2>
          <p>{formatUnits(BigInt(proof.amount), WIF_DECIMALS)} WIF sent to {proof.recipient.slice(0, 8)}…{proof.recipient.slice(-6)}.</p>
          <p>Invite the recipient to take the quest. Your next week opens on Monday at 00:00 UTC.</p>
          <div className={styles.actions}>
            <button className="primary-button" onClick={copyInvite}>Copy quest link ↗</button>
            <a href={`${WIF_EXPLORER}/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">View verified transfer ↗</a>
          </div>
        </section>
        : <div className={styles.steps}>
          <section className={styles.panel}>
            <span className={styles.kicker}>01 / SEND WIF</span>
            <h2>Welcome another wallet</h2>
            <p>Choose the recipient and amount. Your wallet shows the transfer and ETH gas fee for you to review.</p>
            {!onMainnet && <button className={styles.secondary} onClick={switchNetwork} disabled={!!busy}>
              {busy === "network" ? "Checking network…" : "Switch to Robinhood Chain ↗"}
            </button>}
            <form onSubmit={sendTransfer}>
              <label>Recipient address
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} maxLength={42} required />
              </label>
              <label>Amount in WIF
                <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" inputMode="decimal" maxLength={97} required />
              </label>
              <button className="primary-button" type="submit" disabled={!!busy || !onMainnet || !progress || !!sentHash}>
                {busy === "transfer" ? "Reviewing in wallet…" : sentHash ? "Transfer hash ready" : "Review transfer in wallet ↗"}
              </button>
            </form>
            {sentHash && <p className={styles.help}>
              <a href={`${WIF_EXPLORER}/tx/${sentHash}`} target="_blank" rel="noreferrer">Check transfer confirmations ↗</a>
            </p>}
          </section>
          <section className={styles.panel}>
            <span className={styles.kicker}>02 / VERIFY PROOF</span>
            <h2>Record this week</h2>
            <p>Use a transfer you sent during this challenge. FlatQuest checks the official WIF token, your wallet and two block confirmations.</p>
            <form onSubmit={verifyProof}>
              <label>Transaction hash
                <input value={hash} onChange={(event) => setHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} maxLength={66} required />
              </label>
              <button className="primary-button" type="submit" disabled={!!busy || !progress}>
                {busy === "proof" ? "Checking receipt…" : "Verify WIF transfer ↗"}
              </button>
            </form>
            <p className={styles.help}>Already sent WIF this week? Paste that transaction’s hash here.</p>
          </section>
        </div>}

      {!!progress?.recentProofs.length && <section className={styles.history}>
        <div><span className={styles.kicker}>TRANSFER HISTORY</span><h2>Recent verified weeks</h2></div>
        <ul>
          {progress.recentProofs.map((record) => <li key={record.transactionHash}>
            <span>Week of {shortDate.format(new Date(record.weekStart))}</span>
            <strong>{formatUnits(BigInt(record.amount), WIF_DECIMALS)} WIF</strong>
            <a href={`${WIF_EXPLORER}/tx/${record.transactionHash}`} target="_blank" rel="noreferrer">View proof ↗</a>
          </li>)}
        </ul>
      </section>}
    </div>
  </main>;
}
