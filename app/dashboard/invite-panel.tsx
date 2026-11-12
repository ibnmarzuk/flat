"use client";

import { useState } from "react";

export default function InvitePanel({ wallet, count }: { wallet: string; count: number }) {
  const [status, setStatus] = useState("");
  async function copyInvite() {
    const url = `${window.location.origin}/?ref=${wallet}`;
    try { await navigator.clipboard.writeText(url); setStatus("Invite link copied."); }
    catch { setStatus(url); }
  }
  return <section className="invite-panel"><div><span className="dashboard-kicker">COMMUNITY LOOP</span><h2>Welcome the next explorer</h2><p>Share your wallet-linked invite. When a new wallet verifies through it, the referral appears on both your leaderboard score and public Passport.</p></div>
    <div className="invite-action"><strong>{count}</strong><span>successful referrals</span><button type="button" onClick={() => void copyInvite()}>Copy invite link ↗</button>{status && <small role="status">{status}</small>}</div></section>;
}
