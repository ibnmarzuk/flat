import Link from "next/link";
import { XP, type XpProgress } from "@/lib/xp-rules";
import type { XpStanding } from "@/lib/xp-progress";
import { getXpLevel } from "@/lib/xp-levels";
import styles from "@/app/swap/xp.module.css";

export default function XpPanel({ xp, wallet, journey }: {
  xp: { progress: XpProgress; rank: number | null; standings: XpStanding[] } | null;
  wallet: string;
  journey: { streak: number; rotation: { slug: string; title: string; action: string; reward: number };
    weeklyComplete: boolean; badges: { name: string; unlocked: boolean }[] } | null;
}) {
  const milestones = [
    { label: "Connect wallet", points: XP.connectWallet, earned: xp?.progress.walletVerified },
    { label: "Verify wallet", points: XP.verifyWallet, earned: xp?.progress.walletVerified },
    { label: "Prove your address onchain", points: XP.addressProof, earned: xp?.progress.addressProven }
  ];
  const level = getXpLevel(xp?.progress.xp ?? 0);
  return <section className="dashboard-progress" aria-labelledby="xp-heading">
    <div className="dashboard-section-head">
      <div><span className="dashboard-kicker">QUEST XP</span><h2 id="xp-heading">Your rank</h2></div>
      {xp && <strong>{xp.progress.xp} XP</strong>}
    </div>
    {xp ? <>
      {journey && <div className="journey-level-grid">
        <article><span>CURRENT LEVEL</span><strong>{level.name}</strong><small>{level.next ? `${level.xpToNext} XP to next level` : "Highest level unlocked"}</small></article>
        <article><span>WEEK STREAK</span><strong>{journey.streak}</strong><small>{journey.weeklyComplete ? "Protected this week" : "Complete one verified action"}</small></article>
        <article><span>REFERRALS</span><strong>{xp.progress.referralCount}</strong><small>+{XP.referral} XP per verified wallet</small></article>
      </div>}
      <div className={styles.summary}>
        <span><strong>{xp.rank === null ? "—" : `#${xp.rank}`}</strong> leaderboard rank</span>
        <span><strong>{xp.progress.onchainActionCount}</strong> verified actions ({xp.progress.testnetTradeCount} swaps · {xp.progress.testnetSendCount} sends)</span>
      </div>
      <ul className={styles.milestones} aria-label="One-time XP quests">{milestones.map((milestone) => <li key={milestone.label}>
        <span>{milestone.earned ? "✓ " : "○ "}{milestone.label}</span><strong>{milestone.earned ? "Earned " : "+"}{milestone.points} XP</strong>
      </li>)}</ul>
      <p>Connect and verify to earn both wallet awards. Each verified Test ETH ↔ Test LOX swap adds {XP.swap} XP, a verified Test LOX send adds {XP.testnetSend} XP, and a successful invite adds {XP.referral} XP.</p>
      {journey && <section className="weekly-rotation"><div><span className="dashboard-kicker">THIS WEEK’S ROTATION</span><h3>{journey.rotation.title}</h3><p>{journey.rotation.action} · +{journey.rotation.reward} XP</p></div><Link className="primary-button" href={`/${journey.rotation.slug}`}>{journey.weeklyComplete ? "Streak protected ✓" : "Complete weekly quest ↗"}</Link></section>}
      <div className="weekly-dashboard-links">
        <Link href={`/passport/${wallet}`}>Open your WIF Passport ↗</Link>
        <Link href={`/invite/${wallet}`}>Invite a wallet ↗</Link>
        <Link href="/swap" prefetch={false}>Open swap quest ↗</Link>
        <Link href="/send" prefetch={false}>Open token send quest ↗</Link>
        <Link href="/wif">Pass WIF Forward ↗</Link>
        {!xp.progress.addressProven && <Link href="/#quest-prove-transaction">Prove your address ↗</Link>}
      </div>
      {journey && <div className="badge-strip" aria-label="Unlockable badges">{journey.badges.map((badge) => <span className={badge.unlocked ? "unlocked" : ""} key={badge.name}>{badge.unlocked ? "✓" : "○"} {badge.name}</span>)}</div>}
      <h3 className={styles.standingsTitle}>XP leaderboard</h3>
      {xp.standings.length ? <table className={styles.standings} aria-label="Top 10 wallets and your rank"><thead><tr><th scope="col">Rank</th><th scope="col">Wallet</th><th scope="col">Actions</th><th scope="col">Invites</th><th scope="col">XP</th></tr></thead>
        <tbody>{xp.standings.map((row) => <tr key={row.position} className={row.isYou ? styles.you : undefined}><td>#{row.rank}</td><td>{row.walletLabel}{row.isYou && <strong> You</strong>}</td><td>{row.onchainActionCount}</td><td>{row.referralCount}</td><td>{row.xp}</td></tr>)}</tbody></table>
        : <p>Your verified activity will put you on the leaderboard.</p>}
    </> : <p>XP rankings are temporarily unavailable.</p>}
  </section>;
}
