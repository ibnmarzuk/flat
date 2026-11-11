"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWalletSession } from "@/app/wallet-session";
import type { TradeProof } from "@/lib/testnet-dex";
import SwapHistory from "@/app/swap/swap-history";
import styles from "@/app/wif/weekly.module.css";

export default function SwapProofs({ address, proofs }: { address: string; proofs: TradeProof[] | null }) {
  const router = useRouter();
  const { wallet, isCurrentWallet, expireSession } = useWalletSession();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const pending = useRef(false);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || wallet !== address || !isCurrentWallet(address)) return;
    if (!/^0x[0-9a-f]{64}$/i.test(hash.trim())) { setMessage({ text: "Paste the full testnet swap hash.", error: true }); return; }
    pending.current = true; setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/testnet-swaps", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, transactionHash: hash.trim() }) });
      const data = await response.json() as { walletAddress?: string; alreadyRecorded?: boolean; error?: string };
      if (!isCurrentWallet(address)) return;
      if (response.status === 401) expireSession(address);
      if (!response.ok || data.walletAddress !== address) throw new Error(data.error || "Unable to verify this swap.");
      setMessage({ text: data.alreadyRecorded ? "This swap is already verified and included in your XP." : "Swap verified on Robinhood testnet. +1 XP earned." });
      router.refresh();
    } catch (error) {
      if (isCurrentWallet(address)) setMessage({ text: error instanceof Error ? error.message : "Unable to verify this swap.", error: true });
    } finally { pending.current = false; setBusy(false); }
  }
  return <section className="dashboard-progress" aria-labelledby="swap-proof-heading">
    <div className="dashboard-section-head"><div><span className="dashboard-kicker">TOKEN SWAP PROOF</span><h2 id="swap-proof-heading">Verify a Robinhood testnet swap</h2></div></div>
    <p>Paste your Test ETH ↔ Test LOX transaction hash. FlatQuest checks the pool swap and two confirmations before adding XP.</p>
    <div className={styles.panel}>
      <form onSubmit={verify}>
        <label htmlFor="dashboard-swap-hash">Robinhood testnet swap hash
          <input id="dashboard-swap-hash" value={hash} onChange={(event) => setHash(event.target.value)}
            placeholder="0x…" maxLength={66} autoComplete="off" spellCheck={false} required />
        </label>
        <button type="submit" className="primary-button" disabled={busy || wallet !== address}>{busy ? "Checking onchain proof…" : "Verify swap & claim XP ↗"}</button>
      </form>
      {message && <p className={styles.feedback} role={message.error ? "alert" : "status"}>{message.text}</p>}
    </div>
    {proofs ? <SwapHistory proofs={proofs} /> : <p>Swap receipt history is temporarily unavailable.</p>}
  </section>;
}
