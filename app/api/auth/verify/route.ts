import { NextResponse } from "next/server";
import { verifyMessage, type Address, type Hex } from "viem";
import { getDb } from "@/lib/db";
import { buildWalletSignInMessage, createSessionToken, getSessionCookieOptions, hashToken, SESSION_COOKIE } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { isValidWalletAddress, isValidWalletNonce, isValidWalletSignature } from "@/lib/wallet-auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_SECONDS = 60 * 60 * 24 * 30;

class ChallengeAlreadyConsumedError extends Error {}

export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }

  const input = body as { address?: unknown; nonce?: unknown; signature?: unknown } | null;
  if (!input || !isValidWalletAddress(input.address) ||
      !isValidWalletNonce(input.nonce) ||
      !isValidWalletSignature(input.signature)) {
    return NextResponse.json({ error: "Invalid wallet sign in request." }, { status: 400 });
  }

  const nonce = input.nonce as string;

  try {
    const address = input.address.toLowerCase();
    const rate = await consumeWalletRateLimit("auth_verify", address, 10, 600);
    if (!rate.allowed) return NextResponse.json({ error: "Too many sign in attempts. Request a new challenge later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const db = getDb();
    const challenges = await db<{ nonce: string; created_at: Date | string; expires_at: Date | string }[]>`
      select nonce, created_at, expires_at
      from public.wallet_auth_challenges
      where wallet_address = ${address}
        and nonce = ${nonce}
        and consumed_at is null
        and expires_at > now()
      limit 1
    `;
    const challenge = challenges[0];
    if (!challenge) return NextResponse.json({ error: "This sign in request has expired or was already used. Try again." }, { status: 401 });

    const origin = new URL(request.url).origin;
    const message = buildWalletSignInMessage({
      domain: new URL(origin).host,
      origin,
      address: input.address,
      nonce: challenge.nonce,
      issuedAt: new Date(challenge.created_at).toISOString(),
      expirationTime: new Date(challenge.expires_at).toISOString()
    });

    const valid = await verifyMessage({
      address: input.address as Address,
      message,
      signature: input.signature as Hex
    });
    if (!valid) return NextResponse.json({ error: "Wallet signature could not be verified." }, { status: 401 });

    const sessionToken = createSessionToken();
    const tokenHash = hashToken(sessionToken);
    const sessionExpiry = new Date(Date.now() + SESSION_SECONDS * 1000);

    await db.begin(async (tx) => {
      const consumed = await tx`
        update public.wallet_auth_challenges
        set consumed_at = now()
        where wallet_address = ${address}
          and nonce = ${nonce}
          and consumed_at is null
          and expires_at > now()
        returning wallet_address
      `;
      if (consumed.length !== 1) throw new ChallengeAlreadyConsumedError("Challenge already consumed.");

      await tx`
        insert into public.profiles (wallet_address)
        values (${address})
        on conflict (wallet_address) do update set updated_at = now()
      `;
      await tx`
        insert into public.completions (wallet_address, quest_id, status, submitted_at, verified_at)
        select ${address}, id, 'verified', now(), now()
        from public.quests where slug = 'connect-wallet'
        on conflict (wallet_address, quest_id) do update
          set status = 'verified', verified_at = now(), updated_at = now()
      `;
      await tx`
        insert into public.wallet_sessions (token_hash, wallet_address, expires_at)
        values (${tokenHash}, ${address}, ${sessionExpiry.toISOString()})
      `;
    });

    const response = NextResponse.json({
      authenticated: true,
      walletAddress: address,
      expiresAt: sessionExpiry.toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof ChallengeAlreadyConsumedError) {
      return NextResponse.json({ error: "This sign in request has already been used. Request a new challenge." }, { status: 401 });
    }
    return NextResponse.json({ error: "Wallet sign in failed. Please request a new challenge." }, { status: 503 });
  }
}
