"use client";

import { useEffect, useState } from "react";

export default function QuestProgress({ slug }: { slug: string }) {
  const [message, setMessage] = useState("Loading your quest progress…");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/progress", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setMessage("Verify your wallet to see and save your progress.");
          return;
        }
        if (!response.ok) throw new Error("Progress unavailable");
        const data = await response.json() as {
          completions?: { slug: string; status: string }[];
        };
        const completion = data.completions?.find((item) => item.slug === slug);
        setMessage(completion?.status === "verified"
          ? "Completed · Verified"
          : completion?.status === "submitted"
            ? "Completed · Self reported"
            : "Ready to continue · Follow the steps below.");
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Progress is temporarily unavailable. Refresh to try again.");
      });
    return () => controller.abort();
  }, [slug]);

  return <p className="quest-progress-status" role="status">{message}</p>;
}
