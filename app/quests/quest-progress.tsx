"use client";

import { useEffect, useState } from "react";
import { useWalletSession } from "../wallet-session";

export default function QuestProgress({ slug }: { slug: string }) {
  const { wallet, checkingSession, expireSession } = useWalletSession();
  const [status, setStatus] = useState<{ slug: string; wallet: string; message: string } | null>(null);

  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    fetch("/api/progress", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          expireSession(wallet);
          return;
        }
        if (!response.ok) throw new Error("Progress unavailable");
        const data = await response.json() as {
          walletAddress: string;
          completions?: { slug: string; status: string }[];
        };
        if (controller.signal.aborted) return;
        if (data.walletAddress?.toLowerCase() !== wallet) {
          expireSession(wallet);
          return;
        }
        const completion = data.completions?.find((item) => item.slug === slug);
        let message = "Ready to continue · Follow the steps below.";
        if (completion?.status === "verified") {
          message = slug === "robinhood-testnet" ? "Completed · Testnet setup recorded" : "Completed · Verified";
        } else if (completion?.status === "submitted") {
          message = "Completed · Self-reported";
        }
        setStatus({ slug, wallet, message });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus({ slug, wallet, message: "Progress is temporarily unavailable. Refresh to try again." });
        }
      });
    return () => controller.abort();
  }, [slug, wallet, expireSession]);

  let message = "Loading your quest progress…";
  if (!checkingSession && !wallet) message = "Verify your wallet to see and save your progress.";
  else if (status?.slug === slug && status.wallet === wallet) message = status.message;
  return <p className="quest-progress-status" role="status">{message}</p>;
}
