"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/app/wallet-session";
import { WIF_EXPLORER } from "@/lib/weekly-wif";
import { XP, type XpProgress } from "@/lib/xp-rules";
import styles from "@/app/wif/weekly.module.css";
import xpStyles from "./xp.module.css";

const PONS_WIF = "https://ponsfamily.com/launchpad/0x5173b8eA6923c2d40267890D45C46a3480954773";

type XpResponse = {
  walletAddress?: string;
  progress?: XpProgress;
  transactionHash?: string;
  alreadyRecorded?: boolean;
  error?: string;
};

type WalletProgress = { wallet: string; progress?: XpProgress; error?: string };
type Verification = { wallet: string; message: string; transactionHash?: string; error?: boolean };

export default function SwapQuest() {
  const { wallet, checkingSession, connecting, connect, notice, retrySeconds, isCurrentWallet, expireSession } = useWalletSession();
  const [loaded, setLoaded] = useState<WalletProgress | null>(null);
  const [reload, setReload] = useState(0);
  const [input, setInput] = useState({ wallet: "", hash: "" });
  const [verification, setVerification] = useState<Verification | null>(null);
  const [submitting, setSubmitting] = useState("");
  const pending = useRef(new Set<string>());
  const current = loaded?.wallet === wallet ? loaded : null;
  const progress = current?.progress;
  const hash = input.wallet === wallet ? input.hash : "";
  const result = verification?.wallet === wallet ? verification : null;
  const nextMilestone = (progress?.swapCount ?? 0) < 5 ? 5 : 20;

  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    async function loadProgress() {
      try {
        const response = await fetch("/api/wif-swaps", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as XpResponse;
        if (controller.signal.aborted || !isCurrentWallet(wallet)) return;
        if (response.status === 401) expireSession(wallet);
        if (!response.ok || data.walletAddress !== wallet || !data.progress) {
          throw new Error(data.error || "Swap XP is temporarily unavailable.");
        }
        setLoaded({ wallet, progress: data.progress });
      } catch (error) {
        if (!controller.signal.aborted && isCurrentWallet(wallet)) {
          setLoaded({ wallet, error: error instanceof Error ? error.message : "Unable to load swap XP." });
        }
      }
    }
    void loadProgress();
    return () => controller.abort();
  }, [wallet, reload, expireSession, isCurrentWallet]);

  async function verifySwap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !progress || pending.current.has(wallet)) return;
    const transactionHash = hash.trim();
    if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) {
      setVerification({ wallet, message: "Paste the full 0x swap transaction hash.", error: true });
      return;
    }
    pending.current.add(wallet);
    setSubmitting(wallet);
    setVerification(null);
    try {
      const response = await fetch("/api/wif-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, transactionHash })
      });
      const data = await response.json() as XpResponse;
      if (!isCurrentWallet(wallet)) return;
      if (response.status === 401) expireSession(wallet);
      if (!response.ok || data.walletAddress !== wallet || !data.progress || !data.transactionHash) {
        throw new Error(data.error || "Unable to verify this swap.");
      }
      setLoaded({ wallet, progress: data.progress });
      setInput({ wallet, hash: "" });
      setVerification({
        wallet,
        transactionHash: data.transactionHash,
        message: data.alreadyRecorded ? "This swap is already in your XP total." : `Swap verified. +${XP.swap} XP earned.`
      });
    } catch (error) {
      if (isCurrentWallet(wallet)) {
        setVerification({ wallet, message: error instanceof Error ? error.message : "Unable to verify this swap.", error: true });
      }
    } finally {
      pending.current.delete(wallet);
      setSubmitting((currentWallet) => currentWallet === wallet ? "" : currentWallet);
    }
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Swap quest navigation">
        <Link href="/#quests">← Quest board</Link>
        <Link href="/dashboard" prefetch={false}>XP leaderboard ↗</Link>
      </nav>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>REPEATABLE QUEST · ROBINHOOD CHAIN</span>
          <h1>Swap for <em>XP.</em></h1>
          <p>Trade ETH and the official $WIF in the Pons pool. Each confirmed swap from your verified wallet earns {XP.swap} XP.</p>
        </div>
        <aside className={styles.week} aria-label="Your XP">
          <span className={styles.kicker}>YOUR QUEST SCORE</span>
          <div className={`${styles.metrics} ${xpStyles.swapMetrics}`}>
            <div><strong>{progress?.xp ?? "—"}</strong><span>Total XP</span></div>
            <div><strong>{progress?.swapCount ?? "—"}</strong><span>Verified swaps</span></div>
          </div>
          {progress && <div className={xpStyles.target}>
            <label htmlFor="swap-target">
              {progress.swapCount >= 20 ? "20-swap milestone complete" : `${progress.swapCount} of ${nextMilestone} swaps to your next milestone`}
            </label>
            <progress id="swap-target" value={Math.min(progress.swapCount, nextMilestone)} max={nextMilestone} />
          </div>}
        </aside>
      </header>

      {notice && <p className={styles.feedback} role="status">{notice}</p>}
      {checkingSession ? <p role="status">Checking wallet session…</p> : !wallet ? <section className={styles.connect}>
        <div><h2>Start with your wallet</h2><p>Connect and verify your wallet to save swap receipts and unlock {XP.connectWallet + XP.verifyWallet} starter XP.</p></div>
        <button className="primary-button" onClick={connect} disabled={connecting || retrySeconds > 0}>
          {connecting ? "Connecting…" : retrySeconds ? `Retry in ${retrySeconds}s` : "Verify wallet ↗"}
        </button>
      </section> : current?.error ? <section className={styles.panel}>
        <p role="alert">{current.error}</p>
        <button className={styles.secondary} onClick={() => { setLoaded(null); setReload(reload + 1); }}>Reload XP</button>
      </section> : !progress ? <p role="status">Loading swap progress…</p> : <>
        <div className={styles.steps}>
          <section className={styles.panel}>
            <span className={styles.kicker}>01 / MAKE A SWAP</span>
            <h2>Trade ETH ↔ $WIF</h2>
            <p>Open Pons in a new tab and use the same wallet you verified here. Review the quote and confirm the swap in your wallet.</p>
            <a className="primary-button" href={PONS_WIF} target="_blank" rel="noreferrer">Open Pons swap ↗</a>
          </section>
          <section className={styles.panel}>
            <span className={styles.kicker}>02 / RECORD YOUR PROOF</span>
            <h2>Claim {XP.swap} XP</h2>
            <p>Copy the swap hash from your wallet activity and verify it after two confirmations.</p>
            <form onSubmit={verifySwap}>
              <label>Swap transaction hash
                <input value={hash} onChange={(event) => setInput({ wallet, hash: event.target.value })}
                  placeholder="0x…" autoComplete="off" spellCheck={false} maxLength={66} required />
              </label>
              <button className="primary-button" type="submit" disabled={submitting === wallet}>
                {submitting === wallet ? "Checking swap…" : "Verify swap ↗"}
              </button>
            </form>
          </section>
        </div>
        {result && <div className={styles.feedback} role={result.error ? "alert" : "status"}>
          <p>{result.message}</p>
          {result.transactionHash && <div className={styles.actions}>
            <a href={`${WIF_EXPLORER}/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">View verified swap ↗</a>
            <Link href="/dashboard" prefetch={false}>See your rank ↗</Link>
          </div>}
        </div>}
      </>}
    </div>
  </main>;
}
