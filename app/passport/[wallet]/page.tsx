import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";
import { getXpDashboard, getTestnetSwapHistory } from "@/lib/xp-progress";
import { getWifProgress } from "@/lib/wif-progress";
import { getXpLevel } from "@/lib/xp-levels";
import { getDb } from "@/lib/db";
import { TESTNET_EXPLORER } from "@/lib/testnet-swap";
import { WIF_EXPLORER } from "@/lib/weekly-wif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ wallet: string }> }): Promise<Metadata> {
  const { wallet } = await params;
  return { title: "WIF Passport | FlatQuest", description: `Verified FlatQuest progress for ${wallet.slice(0, 8)}…${wallet.slice(-6)}.` };
}

export default async function PassportPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet: rawWallet } = await params;
  if (!isValidWalletAddress(rawWallet)) notFound();
  const wallet = rawWallet.toLowerCase();
  const db = getDb();
  const [dashboard, wif, trades, referrals, milestones] = await Promise.all([
    getXpDashboard(wallet),
    getWifProgress(wallet).catch(() => null),
    getTestnetSwapHistory(wallet).catch(() => []),
    db<{ invited: number }[]>`select count(*)::int as invited from public.wallet_referrals where lower(inviter_wallet) = ${wallet}`,
    db<{ slug: string; title: string; verified_at: Date | string; transaction_hash: string | null; chain_id: number | null }[]>`
      select q.slug, q.title, c.verified_at, vr.transaction_hash, vr.chain_id
      from public.completions c join public.quests q on q.id = c.quest_id
      left join lateral (select transaction_hash, chain_id from public.verification_records where completion_id = c.id order by verified_at desc limit 1) vr on true
      where lower(c.wallet_address) = ${wallet} and c.status = 'verified'
      order by c.verified_at desc limit 12
    `
  ]);
  const xp = dashboard.progress;
  const level = getXpLevel(xp.xp);
  const inviteUrl = `/invite/${wallet}`;

  return <main className="passport-page">
    <div className="passport-shell">
      <nav className="passport-nav"><Link href="/" className="passport-brand">flat<span>quest</span></Link><Link href="/swap">Explore quests ↗</Link></nav>
      <header className="passport-hero">
        <span className="passport-kicker">WORLD IS FLAT · WALLET PASSPORT</span>
        <h1>Proof of <em>progress.</em></h1>
        <p className="passport-wallet">{wallet.slice(0, 10)}…{wallet.slice(-8)}</p>
        <div className="passport-level"><div><small>CURRENT LEVEL</small><strong>{level.name}</strong><span>{level.description}</span></div><b>{xp.xp} XP</b></div>
        <div className="passport-meter"><span style={{ width: `${level.progress}%` }} /></div>
        <p className="passport-next">{level.next === null ? "Highest level reached" : `${level.xpToNext} XP to ${level.next === 25 ? "Explorer" : level.next === 75 ? "Builder" : "WIF Guide"}`}</p>
      </header>
      <section className="passport-stats">
        <article><small>XP RANK</small><strong>{dashboard.rank ? `#${dashboard.rank}` : "—"}</strong></article>
        <article><small>WIF WEEKLY STREAK</small><strong>{wif?.streak ?? 0}</strong></article>
        <article><small>WIF WEEKS COMPLETED</small><strong>{wif?.totalWeeks ?? 0}</strong></article>
        <article><small>INVITED WALLETS</small><strong>{referrals[0]?.invited ?? 0}</strong></article>
      </section>
      <section className="passport-section">
        <div className="passport-section-heading"><div><span className="passport-kicker">VERIFIABLE ACTIVITY</span><h2>Milestones</h2></div><span>{milestones.length} recorded</span></div>
        {milestones.length ? <div className="passport-list">{milestones.map((item) => <article key={item.slug}><div><strong>{item.title}</strong><small>{new Date(item.verified_at).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })} · Verified</small></div>{item.transaction_hash ? <a href={`${Number(item.chain_id) === 4663 ? WIF_EXPLORER : TESTNET_EXPLORER}/tx/${item.transaction_hash}`} target="_blank" rel="noreferrer">Explorer proof ↗</a> : <span>Wallet milestone</span>}</article>)}</div> : <p className="passport-empty">Verified milestones will appear here as this wallet completes quests.</p>}
      </section>
      {trades.length > 0 && <section className="passport-section"><div className="passport-section-heading"><div><span className="passport-kicker">TESTNET TRADES</span><h2>Recent swaps</h2></div></div><div className="passport-list">{trades.slice(0,5).map((trade) => <article key={trade.transactionHash}><div><strong>Test ETH ↔ Test LOX</strong><small>{trade.direction} · {trade.amount} Test LOX</small></div><a href={`${TESTNET_EXPLORER}/tx/${trade.transactionHash}`} target="_blank" rel="noreferrer">Explorer proof ↗</a></article>)}</div><p className="passport-disclaimer">These are Robinhood Chain testnet actions using faucet assets. They are not mainnet $WIF transactions.</p></section>}
      <section className="passport-share"><span className="passport-kicker">GROW THE COMMUNITY</span><h2>Pass the journey forward.</h2><p>Invite another wallet to FlatQuest. Their first verified invitation can be attributed to your wallet.</p><Link href="/wif" className="passport-button">Explore Pass WIF Forward ↗</Link><Link href={inviteUrl} className="passport-button">Open your invite link ↗</Link></section>
      <footer className="passport-footer"><span>FlatQuest · Discover. Prove. Grow.</span><Link href="/">Start your own journey ↗</Link></footer>
    </div>
  </main>;
}
