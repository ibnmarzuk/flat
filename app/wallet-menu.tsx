"use client";

import Link from "next/link";
import { useWalletSession } from "./wallet-session";

export default function WalletMenu({ compact = false }: { compact?: boolean }) {
  const { account, wallet, checkingSession, connecting, disconnecting, retrySeconds, connect, disconnect } = useWalletSession();
  const label = checkingSession ? "Checking wallet…"
    : retrySeconds ? `Retry in ${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}`
    : connecting ? "Connecting…"
    : account ? (wallet ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Verify wallet")
    : "Connect wallet";

  if (!wallet) return <button className="connect-button" onClick={() => void connect()}
    disabled={checkingSession || connecting || retrySeconds > 0} aria-busy={checkingSession || connecting}>
    {label} <span>{connecting ? "…" : "↗"}</span>
  </button>;

  return <div className={`wallet-menu${compact ? " wallet-menu-compact" : ""}`}>
    <button className="connect-button wallet-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false">
      {label} <span>⌄</span>
    </button>
    <div className="wallet-menu-popover" role="menu" aria-label="Wallet options">
      <span>VERIFIED WALLET</span>
      <strong>{account}</strong>
      <Link href={`/passport/${wallet}`} role="menuitem">Open WIF Passport ↗</Link>
      <button type="button" role="menuitem" onClick={() => void disconnect()} disabled={disconnecting}>
        {disconnecting ? "Disconnecting…" : "Disconnect wallet"}
      </button>
    </div>
  </div>;
}
