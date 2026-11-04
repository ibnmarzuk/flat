import { NextResponse } from "next/server";
import { getAuthenticatedWallet } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_URL = process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const EXPECTED_CHAIN_ID = "0xb626";

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

  const clientChainId = body && typeof body === "object" ? (body as { chainId?: unknown }).chainId : null;
  if (typeof clientChainId !== "string" || clientChainId.toLowerCase() !== EXPECTED_CHAIN_ID) {
    return NextResponse.json({ error: "Switch your wallet to Robinhood Chain testnet first." }, { status: 400 });
  }

  try {
    const rate = await consumeWalletRateLimit("network_verify", wallet, 20, 3600);
    if (!rate.allowed) return NextResponse.json({ error: "Too many network checks. Try again later." }, { status: 429 });
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("RPC unavailable");
    const payload = await response.json() as { result?: unknown; error?: { message?: string } };
    if (payload.error || typeof payload.result !== "string" || payload.result.toLowerCase() !== EXPECTED_CHAIN_ID) {
      return NextResponse.json({ error: "The configured RPC did not confirm Robinhood Chain testnet." }, { status: 503 });
    }

    const db = getDb();
    const rows = await db`
      insert into public.completions (wallet_address, quest_id, status, submitted_at, verified_at)
      select ${wallet.toLowerCase()}, id, 'verified', now(), now()
      from public.quests where slug = 'robinhood-testnet' and is_published = true
      on conflict (wallet_address, quest_id) do update
        set status = 'verified', verified_at = now(), updated_at = now()
      returning id
    `;
    if (!rows[0]) return NextResponse.json({ error: "The network quest is not available." }, { status: 404 });
    return NextResponse.json({ verified: true, chainId: 46630, walletAddress: wallet }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Network verification is temporarily unavailable." }, { status: 503 });
  }
}
