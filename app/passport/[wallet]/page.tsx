import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getJourneyProfile, getReferralWallets, getTestnetSendHistory, getTestnetSwapHistory, getXpDashboard } from "@/lib/xp-progress";
import { getWifProgress } from "@/lib/wif-progress";
import { getXpLevel } from "@/lib/xp-levels";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";
import { TESTNET_EXPLORER } from "@/lib/testnet-swap";
import { WIF_EXPLORER } from "@/lib/weekly-wif";
import SharePassport from "./share-passport";

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
  const profiles = await db<{ wallet_address: string }[]>`select wallet_address from public.profiles where lower(wallet_address) = ${wallet} limit 1`;
  if (!profiles[0]) notFound();
  const [dashboard, journey, wif, trades, sends, invitedWallets, milestones] = await Promise.all([
    getXpDashboard(wallet),
    getJourneyProfile(wallet),
    getWifProgress(wallet).catch(() => null),
    getTestnetSwapHistory(wallet).catch(() => []),
    getTestnetSendHistory(wallet).catch(() => []),
    getReferralWallets(wallet),
    db<{ slug: string; title: string; verified_at: Date | string; transaction_hash: string | null; chain_id: number | null }[]>`
      select q.slug, q.title, c.verified_at, vr.transaction_hash, vr.chain_id
      from public.completions c join public.quests q on q.id = c.quest_id
      left join lateral (select transaction_hash, chain_id from public.verification_records where completion_id = c.id order by verified_at desc limit 1) vr on true
      where lower(c.wallet_address) = ${wallet} and c.status = 'verified'
      order by c.verified_at desc limit 12
    `
  ]);
  const xp = journey.progress;
  const level = getXpLevel(xp.xp);
  const inviteUrl = `/invite/${wallet}`;

  return <main className="passport-page"><div className="passport-shell">
    <nav className="passport-nav"><Link href="/" className="passport-brand">flat<span>quest</span></Link><Link href="/dashboard">My dashboard ↗</Link></nav>
    <header className="passport-hero"><span className="passport-kicker">WORLD IS FLAT · PUBLIC WALLET PASSPORT</span><h1>Proof of <em>progress.</em></h1><p className="passport-wallet">{wallet.slice(0, 10)}…{wallet.slice(-8)}</p>
      <p>A shareable trail of faucet-funded testnet actions, XP, community invites and explorer-backed proof.</p>
      <div className="passport-level"><div><small>CURRENT LEVEL</small><strong>{level.name}</strong><span>{level.description}</span></div><b>{xp.xp} XP</b></div>
      <div className="passport-meter"><span style={{ width: `${level.progress}%` }}/></div><p className="passport-next">{level.next === null ? "Highest level reached" : `${level.xpToNext} XP to the next level`}</p>
      <SharePassport wallet={wallet}/>
    </header>
    <section className="passport-stats"><article><small>XP RANK</small><strong>{dashboard.rank ? `#${dashboard.rank}` : "—"}</strong></article><article><small>TESTNET WEEK STREAK</small><strong>{journey.streak}</strong></article><article><small>VERIFIED ACTIONS</small><strong>{xp.onchainActionCount}</strong></article><article><small>INVITED WALLETS</small><strong>{invitedWallets.length}</strong></article></section>

    <section className="passport-section"><div className="passport-section-heading"><div><span className="passport-kicker">UNLOCKED AS YOU BUILD</span><h2>Journey badges</h2></div><span>{journey.badges.filter((badge) => badge.unlocked).length} unlocked</span></div><div className="passport-badges">{journey.badges.map((badge) => <span key={badge.name} className={badge.unlocked ? "earned" : "locked"}>{badge.unlocked ? "✦" : "○"} {badge.name}</span>)}</div></section>

    <section className="passport-section"><div className="passport-section-heading"><div><span className="passport-kicker">VERIFIABLE ACTIVITY</span><h2>Milestones</h2></div><span>{milestones.length} recorded</span></div>
      {milestones.length ? <div className="passport-list">{milestones.map((item) => <article key={item.slug}><div><strong>{item.title}</strong><small>{new Date(item.verified_at).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })} · Verified</small></div>{item.transaction_hash ? <a href={`${Number(item.chain_id) === 4663 ? WIF_EXPLORER : TESTNET_EXPLORER}/tx/${item.transaction_hash}`} target="_blank" rel="noreferrer">Explorer proof ↗</a> : <span>Wallet milestone</span>}</article>)}</div> : <p className="passport-empty">Verified milestones will appear here as this wallet completes quests.</p>}
    </section>

    {journey.activity.length > 0 && <section className="passport-section"><div className="passport-section-heading"><div><span className="passport-kicker">ROBINHOOD TESTNET</span><h2>Proof trail</h2></div><span>{journey.activity.length} receipts</span></div><div className="passport-list">{journey.activity.map((item) => <article key={`${item.transactionHash}-${item.kind}`}><div><strong>{item.kind}</strong><small>{item.detail ? `${item.detail} · ` : ""}Block {item.blockNumber} · {item.confirmations} confirmations</small></div><a href={`${TESTNET_EXPLORER}/tx/${item.transactionHash}`} target="_blank" rel="noreferrer">Explorer proof ↗</a></article>)}</div><p className="passport-disclaimer">These are faucet-funded testnet actions. Test ETH and Test LOX do not represent mainnet $WIF or monetary value.</p></section>}

    {(trades.length > 0 || sends.length > 0) && <section className="passport-section"><div className="passport-section-heading"><div><span className="passport-kicker">QUEST BREAKDOWN</span><h2>Verified token actions</h2></div></div><div className="passport-list">{trades.slice(0, 3).map((trade) => <article key={trade.transactionHash}><div><strong>Test ETH ↔ Test LOX</strong><small>{trade.direction} · {trade.amount} Test LOX</small></div><a href={`${TESTNET_EXPLORER}/tx/${trade.transactionHash}`} target="_blank" rel="noreferrer">Swap proof ↗</a></article>)}{sends.slice(0, 3).map((send) => <article key={send.transactionHash}><div><strong>Token Courier</strong><small>{send.amount} Test LOX · to {send.recipient.slice(0, 8)}…{send.recipient.slice(-6)}</small></div><a href={`${TESTNET_EXPLORER}/tx/${send.transactionHash}`} target="_blank" rel="noreferrer">Send proof ↗</a></article>)}</div></section>}

    {invitedWallets.length > 0 && <section className="passport-section"><div className="passport-section-heading"><div><span className="passport-kicker">YOUR COMMUNITY</span><h2>Invited wallets</h2></div><span>{invitedWallets.length} attributed</span></div><div className="passport-invitees">{invitedWallets.map((address) => <span key={address}>{address.slice(0, 8)}…{address.slice(-6)}</span>)}</div></section>}

    <section className="passport-share"><span className="passport-kicker">THIS WEEK’S ROTATION</span><h2>{journey.rotation.title}</h2><p>{journey.weeklyComplete ? "Weekly testnet proof complete. This wallet’s streak is protected." : `${journey.rotation.action} to protect this wallet’s weekly streak.`}</p><Link href={`/${journey.rotation.slug}`} className="passport-button">Open weekly quest ↗</Link><Link href={inviteUrl} className="passport-button">Open wallet invite ↗</Link><Link href="/wif" className="passport-button">Optional: Pass WIF Forward ↗</Link>{wif && <p className="passport-disclaimer">Optional mainnet WIF streak: {wif.streak} week{wif.streak === 1 ? "" : "s"}.</p>}</section>
    <footer className="passport-footer"><span>FlatQuest · Discover. Prove. Grow.</span><Link href="/">Start your own journey ↗</Link></footer>
  </div></main>;
}
