"use client";

import { useEffect, useState } from "react";
import { useWalletSession } from "@/app/wallet-session";

export default function InviteClaim({ inviter }: { inviter: string }) {
  const { wallet, checkingSession } = useWalletSession();
  const [status, setStatus] = useState("Connect and verify your wallet to record this invitation.");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!wallet || checkingSession || done) return;
    let active = true;
    fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviterWallet: inviter })
    }).then(async (response) => {
      const data = await response.json() as { recorded?: boolean; message?: string; error?: string };
      if (!active) return;
      if (response.ok) {
        setStatus(data.recorded ? "Invitation linked to your wallet." : data.message || "Invitation checked.");
        setDone(true);
      } else if (response.status !== 401) setStatus(data.error || "Invitation could not be recorded.");
    }).catch(() => { if (active) setStatus("Invitation could not be checked. Refresh to try again."); });
    return () => { active = false; };
  }, [wallet, checkingSession, inviter, done]);

  return <p className="passport-invite-status" role="status">{status}</p>;
}
