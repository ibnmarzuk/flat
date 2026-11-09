"use client";

import { useState } from "react";
import { WIF_EXPLORER } from "@/lib/weekly-wif";
import styles from "../weekly.module.css";

type Receipt = {
  transactionHash: string;
  blockNumber: string;
  blockTime: string;
  confirmations: number;
};

export default function ExampleReceipt() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/wif-example", { cache: "no-store" });
      if (!response.ok) throw new Error("Receipt unavailable");
      setReceipt(await response.json() as Receipt);
    } catch {
      setError("The example receipt is temporarily unavailable. Try again.");
    } finally {
      setChecking(false);
    }
  }

  return <section className={receipt ? styles.complete : styles.connect} aria-live="polite">
    {receipt ? <>
      <span className={styles.kicker}>✓ PUBLIC RECEIPT CHECKED</span>
      <h2>Official $WIF transfer found</h2>
      <p>Successful receipt · Canonical block {Number(receipt.blockNumber).toLocaleString("en")} · {receipt.confirmations.toLocaleString("en")} confirmations at check</p>
      <div className={styles.actions}>
        <a href={`${WIF_EXPLORER}/tx/${receipt.transactionHash}`} target="_blank" rel="noreferrer">Open the public receipt ↗</a>
      </div>
    </> : <>
      <div><h2>Check the example receipt</h2><p>FlatQuest checks the token event, block, and confirmations against the network.</p>
        {error && <p role="status">{error}</p>}
      </div>
      <button className="primary-button" disabled={checking} onClick={check}>{checking ? "Checking receipt…" : "Check receipt ↗"}</button>
    </>}
  </section>;
}
