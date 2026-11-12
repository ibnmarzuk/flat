import { NextResponse } from "next/server";
import { getAuthenticatedWallet } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { getJourneyProfile, saveReferral } from "@/lib/xp-progress";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 512) return NextResponse.json({ error: "Request body too large." }, { status: 413, headers });
  let body: { referrer?: unknown; inviterWallet?: unknown } | null;
  try {
    const raw = await request.text();
    if (raw.length > 512) return NextResponse.json({ error: "Request body too large." }, { status: 413, headers });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "Send a valid referral request." }, { status: 400, headers }); }
  const input = body?.referrer ?? body?.inviterWallet;
  if (!isValidWalletAddress(input)) return NextResponse.json({ error: "Use a valid FlatQuest invite link." }, { status: 400, headers });
  try {
    const invitee = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!invitee) return NextResponse.json({ error: "Verify your wallet to accept this invite." }, { status: 401, headers });
    const requestedReferrer = input.toLowerCase();
    if (requestedReferrer === invitee) return NextResponse.json({ error: "You cannot refer your own wallet." }, { status: 422, headers });
    const rate = await consumeWalletRateLimit("wallet_referral", invitee, 10, 86400);
    if (!rate.allowed) return NextResponse.json({ error: "Too many referral attempts. Try again later." },
      { status: 429, headers: { ...headers, "Retry-After": String(rate.retryAfterSeconds) } });
    let referrer = requestedReferrer;
    let existingTableAttribution = false;
    try {
      const db = getDb();
      const existing = await db<{ inviter_wallet: string }[]>`
        select inviter_wallet from public.wallet_referrals
        where lower(invitee_wallet) = ${invitee} limit 1
      `;
      if (existing[0]) {
        referrer = existing[0].inviter_wallet.toLowerCase();
        existingTableAttribution = true;
      }
    } catch { /* Evidence remains authoritative until migration 0005 is available. */ }
    const saved = await saveReferral(referrer, invitee);

    // Keep migration 0005's dedicated table in sync when it is available.
    // Passport and XP reads also use the durable evidence record so a rolling
    // deployment does not disable onboarding before the migration is applied.
    try {
      const db = getDb();
      await db`
        insert into public.wallet_referrals (inviter_wallet, invitee_wallet)
        values (${referrer}, ${invitee})
        on conflict (invitee_wallet) do nothing
      `;
    } catch { /* Migration 0005 may still be pending on this deployment. */ }

    return NextResponse.json({ walletAddress: invitee, referrer, inviterWallet: referrer,
      saved, recorded: saved && !existingTableAttribution, alreadyRecorded: !saved || existingTableAttribution,
      message: saved && !existingTableAttribution ? "Invitation linked to your wallet." : "An invite has already been attributed to this wallet.",
      profile: await getJourneyProfile(invitee) }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Referral could not be recorded.";
    const invalidProfile = message.includes("verified FlatQuest profiles");
    return NextResponse.json({ error: invalidProfile ? "This invite link does not belong to a verified FlatQuest wallet." : "Referral is temporarily unavailable." },
      { status: invalidProfile ? 422 : 503, headers });
  }
}
