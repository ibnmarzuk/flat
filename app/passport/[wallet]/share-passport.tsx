"use client";

import { useState } from "react";

export default function SharePassport({ wallet }: { wallet: string }) {
  const [status, setStatus] = useState("");
  async function share() {
    const url = `${window.location.origin}/passport/${wallet}`;
    try {
      if (navigator.share) await navigator.share({ title: "My FLATquest WIF Passport", text: "See my verified FLATquest journey.", url });
      else { await navigator.clipboard.writeText(url); setStatus("Passport link copied."); }
    } catch { setStatus("Copy the page address to share your Passport."); }
  }
  return <div className="passport-share-action"><button className="passport-button" type="button" onClick={() => void share()}>Share Passport ↗</button>{status && <span role="status">{status}</span>}</div>;
}
