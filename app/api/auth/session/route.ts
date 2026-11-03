import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const db = getDb();
    const rows = await db<{ wallet_address: string; expires_at: Date | string }[]>\`
      select wallet_address, expires_at
      from public.wallet_sessions
      where token_hash = ${hashToken(token)}
        and revoked_at is null and expires_at > now()
      limit 1
    \`;
    if (!rows[0]) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({
      authenticated: true,
      walletAddress: rows[0].wallet_address,
      expiresAt: new Date(rows[0].expires_at).toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Session lookup is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    try {
      const db = getDb();
      await db\`
        update public.wallet_sessions set revoked_at = now()
        where token_hash = ${hashToken(token)} and revoked_at is null
      \`;
    } catch {
      return NextResponse.json({ error: "Sign out is temporarily unavailable." }, { status: 503 });
    }
  }
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE, "", { ...({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" }), maxAge: 0 });
  return response;
}
