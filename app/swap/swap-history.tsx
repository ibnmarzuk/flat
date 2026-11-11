"use client";

import { useState } from "react";
import { formatEther } from "viem";
import type { TradeProof } from "@/lib/testnet-dex";
import { TESTNET_EXPLORER } from "@/lib/testnet-swap";
import styles from "@/app/wif/weekly.module.css";
import xpStyles from "./xp.module.css";

export default function SwapHistory({ proofs }: { proofs: TradeProof[] }) {
  const [message, setMessage] = useState("");
  async function copy(hash: string) {
    try { await navigator.clipboard.writeText(hash); setMessage("Transaction hash copied."); }
    catch { setMessage("Select the full transaction hash and copy it manually."); }
  }
  return <section className={styles.history} aria-label="Your verified Robinhood testnet swaps">
    <span className={styles.kicker}>ROBINHOOD CHAIN TESTNET · 46630</span>
    <h2>Your testnet swap receipts</h2>
    {proofs.length ? proofs.map((proof) => <article className={xpStyles.historyReceipt} key={proof.transactionHash}>
      <p><strong>{proof.direction === "buy"
        ? `${formatEther(BigInt(proof.ethAmount))} Test ETH → ${formatEther(BigInt(proof.amount))} Test LOX`
        : `${formatEther(BigInt(proof.amount))} Test LOX → ${formatEther(BigInt(proof.ethAmount))} Test ETH`}</strong></p>
      <p className={styles.help}>Verified · +1 XP · Block {proof.blockNumber} · {proof.confirmations} confirmations at verification</p>
      <div className={xpStyles.receipt}><code>{proof.transactionHash}</code>
        <div className={styles.actions}>
          <button className={styles.secondary} type="button" onClick={() => void copy(proof.transactionHash)}>Copy hash</button>
          <a href={`${TESTNET_EXPLORER}/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">View on Robinhood testnet ↗</a>
        </div>
      </div>
    </article>) : <p>Your confirmed token swaps will appear here with their full transaction hashes.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
