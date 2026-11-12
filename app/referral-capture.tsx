"use client";

import { useEffect, useRef } from "react";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";
import { useWalletSession } from "./wallet-session";

const key = "flatquest:pending-referrer";

export default function ReferralCapture() {
  const { wallet, isCurrentWallet, setNotice } = useWalletSession();
  const recording = useRef(false);

  useEffect(() => {
    const referrer = new URLSearchParams(window.location.search).get("ref");
    if (isValidWalletAddress(referrer)) {
      try { localStorage.setItem(key, referrer.toLowerCase()); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!wallet || recording.current) return;
    let referrer = "";
    try { referrer = localStorage.getItem(key) || ""; } catch {}
    if (!isValidWalletAddress(referrer)) return;
    if (referrer === wallet) { try { localStorage.removeItem(key); } catch {} return; }
    recording.current = true;
    void fetch("/api/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referrer }) })
      .then(async (response) => {
        const data = await response.json() as { saved?: boolean; alreadyRecorded?: boolean; error?: string };
        if (!isCurrentWallet(wallet)) return;
        if (response.ok) {
          try { localStorage.removeItem(key); } catch {}
          if (data.saved) setNotice("Invite accepted. Your onboarding is now linked to the wallet that welcomed you.");
        } else if (response.status === 400 || response.status === 422) {
          try { localStorage.removeItem(key); } catch {}
        }
      }).catch(() => {}).finally(() => { recording.current = false; });
  }, [wallet, isCurrentWallet, setNotice]);

  return null;
}
