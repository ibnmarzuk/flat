import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { getWifProgress } from "@/lib/wif-progress";
import { WIF_EXPLORER, WIF_QUEST_SLUG } from "@/lib/weekly-wif";
import WalletGate from "./wallet-gate";
import { getAuthenticatedWallet, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Completion = {
  slug: string;
  title: string;
  category: string;
  status: "started" | "submitted" | "verified" | "rejected";
  submitted_at: Date | string | null;
  verified_at: Date | string | null;
  transaction_hash: string | null;
  block_number: string | number | null;
  confirmations: number | null;
  chain_id: string | number | null;
};

function shortWallet(address: string) {
  return address.slice(0, 8) + "…" + address.slice(-6);
}

function formatDate(value: Date | string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const wallet = await getAuthenticatedWallet(token ? SESSION_COOKIE + "=" + token : null);

  if (!wallet) {
    return <main className="dashboard-page"><div className="dashboard-shell"><Link href="/" className="guide-back">← Back to FlatQuest</Link><div className="dashboard-empty"><span className="dashboard-kicker">YOUR FLATQUEST ACCOUNT</span><h1>Your journey,<br/><em>all in one place.</em></h1><p>Connect and verify your wallet to see saved milestones, verified proof and your next step.</p><Link href="/#quest-connect-wallet" className="primary-button">Connect your wallet <span>↗</span></Link></div></div></main>;
  }

  const db = getDb();
  const rows = await db<Completion[]>`
    select q.slug, q.title, q.category, c.status, c.submitted_at, c.verified_at,
           vr.transaction_hash, vr.block_number, vr.confirmations, vr.chain_id
    from public.completions c
    join public.quests q on q.id = c.quest_id
    left join lateral (
      select transaction_hash, block_number, confirmations, chain_id
      from public.verification_records
      where completion_id = c.id
      order by verified_at desc
      limit 1
    ) vr on true
    where c.wallet_address = ${wallet} and q.slug <> ${WIF_QUEST_SLUG}
    order by coalesce(c.verified_at, c.submitted_at, c.updated_at) desc
  `;
  const weekly = await getWifProgress(wallet).catch(() => null);
  const latestWifProof = weekly?.recentProofs[0];
  const starterPath = [
    { slug: "connect-wallet", title: "Connect your wallet" },
    { slug: "robinhood-testnet", title: "Get your network ready" },
    { slug: "prove-transaction", title: "Build your first proof" },
    { slug: "explore-ecosystem", title: "Explore the ecosystem" }
  ];
  const starterRows = rows.filter((row) => starterPath.some((quest) => quest.slug === row.slug));
  const verified = starterRows.filter((row) => row.status === "verified").length;
  const submitted = starterRows.filter((row) => row.status === "submitted").length;
  const total = starterPath.length;
  const recorded = verified + submitted;
  const progress = Math.round((recorded / total) * 100);
  const nextQuest = starterPath.find((quest) => !starterRows.some((row) =>
    row.slug === quest.slug && (row.status === "verified" || row.status === "submitted")
  ));

  return <WalletGate address={wallet}><main className="dashboard-page">
    <div className="dashboard-shell">
      <nav className="dashboard-nav"><Link href="/" className="wordmark"><span className="brand-mark small"><svg viewBox="0 0 64 64" fill="none"><path d="M14 43.5C19.2 43.5 20.3 32 29 32C36.2 32 36.4 20.5 49 20.5" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round"/><circle cx="14" cy="43.5" r="5" fill="currentColor"/><circle cx="29" cy="32" r="5" fill="currentColor" stroke="#C7F36B" strokeWidth="2"/><path d="m42 20.5 5.2 5.2 8.3-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>flat<span className="wordmark-light">quest</span></span></Link><Link href="/#quests" className="dashboard-back">Explore quests ↗</Link></nav>
      <div className="dashboard-header"><div><span className="dashboard-kicker">YOUR ONCHAIN JOURNEY</span><h1>Your progress.<br/><em>Backed by proof.</em></h1><p>One place for your FlatQuest milestones and verifiable activity.</p></div><div className="dashboard-wallet"><small>CONNECTED WALLET</small><strong>{shortWallet(wallet)}</strong><a href={"https://explorer.testnet.chain.robinhood.com/address/" + wallet} target="_blank" rel="noreferrer">View on explorer ↗</a></div></div>
      <section className="dashboard-stats"><article><small>VERIFIED MILESTONES</small><strong>{verified}</strong><span>Wallet, network and transaction checks</span></article><article><small>SELF REPORTED</small><strong>{submitted}</strong><span>Learning activity recorded</span></article><article><small>QUESTS AVAILABLE</small><strong>{total}</strong><span>In the current starter path</span></article></section>
      <section className="dashboard-progress"><div className="dashboard-section-head"><div><span className="dashboard-kicker">YOUR JOURNEY</span><h2>Keep moving forward</h2></div><strong>{progress}%</strong></div><div className="dashboard-track"><span style={{width: progress + "%"}}/></div><p>{recorded} of {total} starter milestones recorded · {verified} verified · {submitted} self reported.</p></section>
      <section className="dashboard-progress">
        <div className="dashboard-section-head">
          <div><span className="dashboard-kicker">WEEKLY MAINNET QUEST</span><h2>Pass $WIF forward</h2></div>
          {weekly && <strong>{weekly.streak} {weekly.streak === 1 ? "week" : "weeks"}</strong>}
        </div>
        <p>{weekly?.currentProof ? "This week’s transfer is verified. Your next quest opens Monday." : "Verify a WIF transfer this week to add to your streak."}
          {weekly && ` ${weekly.totalWeeks} verified ${weekly.totalWeeks === 1 ? "week" : "weeks"} overall.`}</p>
        <div className="weekly-dashboard-links">
          <Link href="/wif" prefetch={false}>Open weekly quest ↗</Link>
          {latestWifProof && <a href={`${WIF_EXPLORER}/tx/${latestWifProof.transactionHash}`} target="_blank" rel="noreferrer">View latest WIF proof ↗</a>}
        </div>
      </section>
      <section className="dashboard-history"><div className="dashboard-section-head"><div><span className="dashboard-kicker">ACTIVITY HISTORY</span><h2>Your milestones</h2></div><span>{rows.length} recorded</span></div>
        {rows.length ? <div className="dashboard-rows">{rows.map((row) => <article className="dashboard-row" key={row.slug}><div className="dashboard-row-icon">{row.status === "verified" ? "✓" : row.status === "submitted" ? "↗" : "○"}</div><div className="dashboard-row-main"><Link href={`/quests/${row.slug}`}><strong>{row.title} ↗</strong></Link><span>{row.category} · {row.status === "verified" ? row.slug === "robinhood-testnet" ? "Network ready" : "Verified" : row.status === "submitted" ? "Self-reported" : row.status}</span>{row.transaction_hash && <><a href={"https://explorer.testnet.chain.robinhood.com/tx/" + row.transaction_hash} target="_blank" rel="noreferrer">View transaction {row.transaction_hash.slice(0, 10)}… ↗</a><small className="dashboard-proof-meta">Chain {row.chain_id ?? "Unknown"} · Block {row.block_number ?? "Pending"} · {row.confirmations ?? 0} confirmations</small></>}</div><div className="dashboard-row-date">{formatDate(row.verified_at || row.submitted_at)}</div></article>)}</div> : <div className="dashboard-no-activity"><strong>Your first milestone is waiting.</strong><p>Start with the wallet connection quest, then follow the guided path.</p><Link href="/#quests">Browse the quest board ↗</Link></div>}
      </section>
      <section className="dashboard-next"><div><span className="dashboard-kicker">{nextQuest ? "RECOMMENDED NEXT STEP" : "STARTER PATH COMPLETE"}</span><h2>{nextQuest ? nextQuest.title : "You completed the starter path."}</h2><p>{nextQuest ? "Open the guide, follow the steps and record your milestone." : "All four milestones are recorded. Your verified evidence and self-reported activity are listed above."}</p></div><Link href={nextQuest ? `/quests/${nextQuest.slug}` : "/#quests"} className="primary-button">{nextQuest ? "Continue quest" : "Review quests"} <span>↗</span></Link></section>
      <footer className="dashboard-footer"><span>Discover. Prove. Grow.</span><span>FlatQuest · Wallet ownership stays with you.</span></footer>
    </div>
  </main></WalletGate>;
}
