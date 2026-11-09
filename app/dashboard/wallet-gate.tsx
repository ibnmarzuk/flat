"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useWalletSession } from "../wallet-session";

export default function WalletGate({ address, children }: { address: string; children: ReactNode }) {
  const { wallet, checkingSession } = useWalletSession();
  if (wallet === address.toLowerCase() && !checkingSession) return children;

  return <main className="dashboard-page">
    <div className="dashboard-shell">
      <div className="dashboard-empty">
        <span className="dashboard-kicker">YOUR FLATQUEST ACCOUNT</span>
        <h1>Your wallet progress</h1>
        {checkingSession ? <p role="status">Checking your wallet session…</p> : <>
          <p>Verify the active wallet to see its saved milestones.</p>
          <Link href="/#quest-connect-wallet" className="primary-button">Verify your wallet <span>↗</span></Link>
        </>}
      </div>
    </div>
  </main>;
}
