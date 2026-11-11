import type { Metadata } from "next";
import Link from "next/link";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";
import InviteClaim from "./invite-claim";

export const metadata: Metadata = {
  title: "Join the FlatQuest journey",
  description: "Join the World Is Flat onboarding journey through a wallet invitation."
};

export default async function InvitePage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const valid = isValidWalletAddress(wallet);
  return <main className="passport-page">
    <div className="passport-shell">
      <Link href="/" className="passport-brand">flat<span>quest</span></Link>
      <section className="passport-hero">
        <span className="passport-kicker">A WALLET INVITATION</span>
        <h1>Pass the journey <em>forward.</em></h1>
        <p>Someone from the FlatQuest community invited you to explore Robinhood Chain, complete guided quests, and build verifiable progress.</p>
        {valid ? <InviteClaim inviter={wallet.toLowerCase()} /> : <p role="alert">This invitation link is not valid.</p>}
        <Link href="/#quest-connect-wallet" className="passport-button">Start your journey ↗</Link>
      </section>
    </div>
  </main>;
}
