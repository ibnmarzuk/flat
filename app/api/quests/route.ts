import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db`
      select slug, title, description, category, verification_type, sort_order
      from public.quests
      where is_published = true
      order by sort_order asc, created_at asc
    `;

    const quests = rows.map((row) => ({
      id: Number(row.sort_order),
      slug: String(row.slug),
      title: String(row.title),
      description: String(row.description),
      category: String(row.category),
      type: row.verification_type === "self_report" ? "explore" : String(row.verification_type),
      reward: row.verification_type === "transaction" ? "Verified proof" : "Milestone"
    }));

    return NextResponse.json({ quests }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("FlatQuest quest catalogue unavailable:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json(
      { error: "The quest catalogue is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
