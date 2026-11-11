import Link from "next/link";
import { XP, type XpProgress } from "@/lib/xp-rules";
import type { XpStanding } from "@/lib/xp-progress";
import styles from "@/app/swap/xp.module.css";
import { getXpLevel } from "@/lib/xp-levels";

export default function XpPanel({ xp, wallet }: {
  xp: { progress: XpProgress; rank: number | null; standings: XpStanding[] } | null;
  wallet: string;
}) {
  const milestones = [
    { label: "Connect wallet", points: XP.connectWallet, earned: xp?.progress.walletVerified },
    { label: "Verify wallet", points: XP.verifyWallet, earned: xp?.progress.walletVerified },
    { label: "Prove your address onchain", points: XP.addressProof, earned: xp?.progress.addressProven }
  ];
  return <section className="dashboard-progress" aria-labelledby="xp-heading">
    <div className="dashboard-section-head">
      <div><span className="dashboard-kicker">QUEST XP</span><h2 id="xp-heading">Your rank</h2></div>
      {xp && <strong>{xp.progress.xp} XP</strong>}
    </div>
    {xp ? <>
      <div className={styles.summary}>
        <span><strong>{getXpLevel(xp.progress.xp).name}</strong> current level</span>
        <span><strong>{xp.rank === null ? "—" : `#${xp.rank}`}</strong> leaderboard rank</span>
        <span><strong>{xp.progress.swapCount}</strong> rewarded actions ({xp.progress.testnetTradeCount} testnet token swaps)</span>
      </div>
      <ul className={styles.milestones} aria-label="One-time XP quests">
        {milestones.map((milestone) => <li key={milestone.label}>
          <span>{milestone.earned ? "✓ " : "○ "}{milestone.label}</span>
          <strong>{milestone.earned ? "Earned " : "+"}{milestone.points} XP</strong>
        </li>)}
      </ul>
      <p>Connect and verify to earn both wallet awards. Complete the starter transaction proof to earn the address award. Each verified Test ETH ↔ Test LOX swap adds {XP.swap} XP.</p>
      <div className="weekly-dashboard-links">
        <Link href={`/passport/${wallet}`}>Open your WIF Passport ↗</Link>
        <Link href={`/invite/${wallet}`}>Invite a wallet ↗</Link>
        <Link href="/swap" prefetch={false}>Open swap quest ↗</Link>
        {!xp.progress.addressProven && <Link href="/#quest-prove-transaction">Prove your address ↗</Link>}
      </div>
      <h3 className={styles.standingsTitle}>XP leaderboard</h3>
      {xp.standings.length ? <table className={styles.standings} aria-label="Top 10 wallets and your rank">
        <thead><tr><th scope="col">Rank</th><th scope="col">Wallet</th><th scope="col">Actions</th><th scope="col">XP</th></tr></thead>
        <tbody>{xp.standings.map((row) => <tr key={row.position} className={row.isYou ? styles.you : undefined}>
          <td>#{row.rank}</td><td>{row.walletLabel}{row.isYou && <strong> You</strong>}</td>
          <td>{row.swapCount}</td><td>{row.xp}</td>
        </tr>)}</tbody>
      </table> : <p>Your verified activity will put you on the leaderboard.</p>}
    </> : <p>XP rankings are temporarily unavailable.</p>}
  </section>;
}
