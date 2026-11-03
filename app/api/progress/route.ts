import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthenticatedWallet } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{2,80}$/;

export async function GET(request: Request) {
  const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
  if (!wallet) return NextResponse.json({ error: "Sign in with your wallet first." }, { status: 401 });
  try {
    const db = getDb();
    const rows = await db<{ slug: string; status: string; verified_at: Date | string | null; submitted_at: Date | string | null }[]>\`
      select q.slug, c.status, c.verified_at, c.submitted_at
      from public.completions c
      join public.quests q on q.id = c.quest_id
      where c.wallet_address = ${wallet}
      order by c.updated_at desc
    \`;
    return NextResponse.json({ walletAddress: wallet, completions: rows }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Progress is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
  if (!wallet) return NextResponse.json({ error: "Sign in with your wallet first." }, { status: 401 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }

  const input = body as { questSlug?: unknown; status?: unknown } | null;
  if (!input || typeof input.questSlug !== "string" || !SLUG.test(input.questSlug) ||
      (input.status !== "started" && input.status !== "submitted")) {
    return NextResponse.json({ error: "Invalid progress update." }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db<{ id: string; verification_type: string }[]>\`
      select id, verification_type from public.quests
      where slug = ${input.questSlug} and is_published = true limit 1
    \`;
    const quest = rows[0];
    if (!quest) return NextResponse.json({ error: "Quest not found." }, { status: 404 });
    if (input.status === "submitted" && quest.verification_type !== "self_report") {
      return NextResponse.json({ error: "This quest requires independent verification. It cannot be self reported." }, { status: 403 });
    }

    const result = await db\`
      insert into public.completions (wallet_address, quest_id, status, submitted_at)
      values (${wallet}, ${quest.id}, ${input.status}, case when ${input.status} = 'submitted' then now() else null end)
      on conflict (wallet_address, quest_id) do update
        set status = case
              when public.completions.status = 'verified' then 'verified'
              when excluded.status = 'submitted' then 'submitted'
              else public.completions.status
            end,
            submitted_at = case
              when excluded.status = 'submitted' then coalesce(public.completions.submitted_at, now())
              else public.completions.submitted_at
            end,
            updated_at = now()
      returning status
    \`;
    return NextResponse.json({ saved: true, status: result[0]?.status || input.status });
  } catch {
    return NextResponse.json({ error: "Progress could not be saved. Try again." }, { status: 503 });
  }
}
