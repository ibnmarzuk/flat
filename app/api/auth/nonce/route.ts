import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { buildWalletSignInMessage } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }

  const address = body && typeof body === "object" ? (body as { address?: unknown }).address : null;
  if (!isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Enter a valid wallet address." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const domain = new URL(origin).host;
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const message = buildWalletSignInMessage({
    domain,
    origin,
    address,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString()
  });

  try {
    const rate = await consumeWalletRateLimit("auth_nonce", address, 5, 600);
    if (!rate.allowed) return NextResponse.json({ error: "Too many sign in requests. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const db = getDb();
    await db`
      insert into public.wallet_auth_challenges (wallet_address, nonce, created_at, expires_at)
      values (${address.toLowerCase()}, ${nonce}, ${issuedAt.toISOString()}, ${expiresAt.toISOString()})
    `;
    return NextResponse.json({ nonce, message, expiresAt: expiresAt.toISOString() }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Sign in is temporarily unavailable." }, { status: 503 });
  }
}
