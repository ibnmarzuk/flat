import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthenticatedWallet } from "@/lib/auth";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const invitee = await getAuthenticatedWallet(request.headers.get("cookie"));
  if (!invitee) return NextResponse.json({ error: "Connect and verify your wallet first." }, { status: 401 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 512) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }
  const inviter = (body as { inviterWallet?: unknown } | null)?.inviterWallet;
  if (!isValidWalletAddress(inviter)) return NextResponse.json({ error: "Invalid invite link." }, { status: 400 });
  if (inviter.toLowerCase() === invitee.toLowerCase()) return NextResponse.json({ error: "You cannot use your own invite link." }, { status: 409 });

  try {
    const db = getDb();
    const rows = await db<{ inviter_wallet: string }[]>`
      insert into public.wallet_referrals (inviter_wallet, invitee_wallet)
      select inviter.wallet_address, invitee.wallet_address
      from public.profiles inviter, public.profiles invitee
      where lower(inviter.wallet_address) = ${inviter.toLowerCase()}
        and lower(invitee.wallet_address) = ${invitee.toLowerCase()}
      on conflict (invitee_wallet) do nothing
      returning inviter_wallet
    `;
    if (rows[0]) return NextResponse.json({ recorded: true });
    const existing = await db<{ inviter_wallet: string }[]>`
      select inviter_wallet from public.wallet_referrals where lower(invitee_wallet) = ${invitee.toLowerCase()} limit 1
    `;
    if (existing[0]) return NextResponse.json({ recorded: false, message: "An invite has already been attributed to this wallet." });
    return NextResponse.json({ error: "The inviter or your wallet profile is not ready yet." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "The invite could not be recorded. Try again." }, { status: 503 });
  }
}
