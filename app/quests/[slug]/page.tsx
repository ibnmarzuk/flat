import Link from "next/link";
import { notFound } from "next/navigation";
import QuestProgress from "../quest-progress";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuestRow = {
  slug: string;
  title: string;
  description: string;
  category: string;
  verification_type: string;
};

type StepRow = {
  id: string;
  title: string;
  instructions: string;
  resource_url: string | null;
  sort_order: number;
};

export default async function QuestGuide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const questRows = await db<QuestRow[]>`
    select slug, title, description, category, verification_type
    from public.quests
    where slug = ${slug} and is_published = true
    limit 1
  `;

  const quest = questRows[0];
  if (!quest) notFound();

  const steps = await db<StepRow[]>`
    select id, title, instructions, resource_url, sort_order
    from public.quest_steps
    where quest_id = (select id from public.quests where slug = ${slug} limit 1)
    order by sort_order asc
  `;

  const resource = steps.find((step) => step.resource_url)?.resource_url;


  return (
    <main className="guide-page">
      <div className="guide-shell">
        <Link href="/#quests" className="guide-back">← Back to quest board</Link>
        <div className="guide-kicker">FLATQUEST FIELD GUIDE</div>
        <div className="guide-heading">
          <span className="guide-category">{quest.category}</span>
          <h1>{quest.title}</h1>
          <p>{quest.description}</p>
        </div>
        <QuestProgress slug={slug} />
        <section className="guide-purpose">
          <span>WHY THIS MATTERS</span>
          <p>{quest.verification_type === "self_report"
            ? "Good onboarding is about understanding what exists and why it matters, not rushing through clicks. This is a learning milestone, not an onchain verification."
            : quest.verification_type === "transaction"
              ? "FlatQuest checks public network evidence for this milestone. A transaction hash is not enough on its own: the receipt, sender and confirmation data must agree."
              : "Follow each step carefully. FlatQuest distinguishes a connected wallet, a detected network and independently verifiable onchain evidence."}</p>
        </section>
        <section className="guide-steps">
          <div className="guide-section-label">YOUR CHECKLIST</div>
          {steps.map((step, index) => (
            <article className="guide-step" key={step.id}>
              <span className="guide-step-number">{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{step.title}</h2><p>{step.instructions}</p>{step.resource_url && <a className="quest-guide-link" href={step.resource_url} target="_blank" rel="noreferrer">Open step resource ↗</a>}</div>
            </article>
          ))}
          {steps.length === 0 && <p>No instructions have been published for this quest yet.</p>}
        </section>
        {resource && (
          <a className="guide-resource" href={resource} target="_blank" rel="noreferrer">
            <span><small>QUEST RESOURCE</small><strong>Open reference material</strong></span><span aria-hidden="true">↗</span>
          </a>
        )}
        <div className="guide-disclaimer">Sign in with your wallet to save your progress. Explorer activity is labelled self reported. Never share your private key or recovery phrase.</div>
        <Link href={`/#quest-${slug}`} className="primary-button guide-cta">Open quest action <span>↗</span></Link>
        <Link href="/dashboard" prefetch={false} className="guide-resource">View my dashboard ↗</Link>
      </div>
    </main>
  );
}
