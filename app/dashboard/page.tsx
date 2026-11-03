import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
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
    return <main className="dashboard-page"><div className="dashboard-shell"><Link href="/" className="guide-back">← Back to FlatQuest</Link><div className="dashboard-empty"><span className="dashboard-kicker">YOUR FLATQUEST ACCOUNT</span><h1>Your journey,<br/><em>all in one place.</em></h1><p>Connect and verify your wallet to see saved milestones, verified proof and your next step.</p><Link href="/#quests" className="primary-button">Connect your wallet <span>↗</span></Link></div></div></main>;
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
    where c.wallet_address = ${wallet}
    order by coalesce(c.verified_at, c.submitted_at, c.updated_at) desc
  `;
  const verified = rows.filter((row) => row.status === "verified").length;
  const submitted = rows.filter((row) => row.status === "submitted").length;
  const total = 4;
  const progress = Math.min(100, Math.round((verified / total) * 100));

  return <main className="dashboard-page">
    <div className="dashboard-shell">
      <nav className="dashboard-nav"><Link href="/" className="wordmark"><span className="brand-mark small"><svg viewBox="0 0 64 64" fill="none"><path d="M14 43.5C19.2 43.5 20.3 32 29 32C36.2 32 36.4 20.5 49 20.5" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round"/><circle cx="14" cy="43.5" r="5" fill="currentColor"/><circle cx="29" cy="32" r="5" fill="currentColor" stroke="#C7F36B" strokeWidth="2"/><path d="m42 20.5 5.2 5.2 8.3-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>flat<span className="wordmark-light">quest</span></span></Link><Link href="/#quests" className="dashboard-back">Explore quests ↗</Link></nav>
      <div className="dashboard-header"><div><span className="dashboard-kicker">YOUR ONCHAIN JOURNEY</span><h1>Your progress.<br/><em>Backed by proof.</em></h1><p>One place for your FlatQuest milestones and verifiable activity.</p></div><div className="dashboard-wallet"><small>CONNECTED WALLET</small><strong>{shortWallet(wallet)}</strong><a href={"https://explorer.testnet.chain.robinhood.com/address/" + wallet} target="_blank" rel="noreferrer">View on explorer ↗</a></div></div>
      <section className="dashboard-stats"><article><small>VERIFIED MILESTONES</small><strong>{verified}</strong><span>Independently checked</span></article><article><small>SELF REPORTED</small><strong>{submitted}</strong><span>Learning activity recorded</span></article><article><small>QUESTS AVAILABLE</small><strong>{total}</strong><span>In the current starter path</span></article></section>
      <section className="dashboard-progress"><div className="dashboard-section-head"><div><span className="dashboard-kicker">YOUR JOURNEY</span><h2>Keep moving forward</h2></div><strong>{progress}%</strong></div><div className="dashboard-track"><span style={{width: progress + "%"}}/></div><p>{verified} of {total} starter milestones independently verified. Self reported activity is shown separately.</p></section>
      <section className="dashboard-history"><div className="dashboard-section-head"><div><span className="dashboard-kicker">ACTIVITY HISTORY</span><h2>Your milestones</h2></div><span>{rows.length} recorded</span></div>
        {rows.length ? <div className="dashboard-rows">{rows.map((row) => <article className="dashboard-row" key={row.slug}><div className="dashboard-row-icon">{row.status === "verified" ? "✓" : row.status === "submitted" ? "↗" : "○"}</div><div className="dashboard-row-main"><strong>{row.title}</strong><span>{row.category} · {row.status === "verified" ? "Verified" : row.status === "submitted" ? "Self reported" : row.status}</span>{row.transaction_hash && <a href={"https://robinhoodchain.blockscout.com/tx/" + row.transaction_hash} target="_blank" rel="noreferrer">Transaction {row.transaction_hash.slice(0, 10)}… ↗</a>}</div><div className="dashboard-row-date">{formatDate(row.verified_at || row.submitted_at)}</div></article>)}</div> : <div className="dashboard-no-activity"><strong>Your first milestone is waiting.</strong><p>Start with the wallet connection quest, then follow the guided path.</p><Link href="/#quests">Browse the quest board ↗</Link></div>}
      </section>
      <section className="dashboard-next"><div><span className="dashboard-kicker">RECOMMENDED NEXT STEP</span><h2>Build your first proof.</h2><p>Learn how transaction evidence works on Robinhood Chain testnet. A successful transaction is not the same as completing a specific ecosystem action.</p></div><Link href="/quests/prove-transaction" className="primary-button">Open quest guide <span>↗</span></Link></section>
      <footer className="dashboard-footer"><span>Discover. Prove. Grow.</span><span>FlatQuest · Wallet ownership stays with you.</span></footer>
    </div>
  </main>;
}
