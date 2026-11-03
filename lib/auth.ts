import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "flatquest_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS
  };
}

export async function getAuthenticatedWallet(cookieHeader: string | null) {
  const token = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = getDb();
  const rows = await db<{ wallet_address: string }[]>\`
    select wallet_address
    from public.wallet_sessions
    where token_hash = ${hashToken(decodeURIComponent(token))}
      and revoked_at is null
      and expires_at > now()
    limit 1
  \`;
  return rows[0]?.wallet_address ?? null;
}

export function buildWalletSignInMessage(input: {
  domain: string;
  origin: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}) {
  return `${input.domain} wants you to sign in with your Ethereum account:
${input.address}

Sign in to FlatQuest. This request will not trigger a blockchain transaction or cost gas.

URI: ${input.origin}
Version: 1
Chain ID: 46630
Nonce: ${input.nonce}
Issued At: ${input.issuedAt}
Expiration Time: ${input.expirationTime}`;
}
