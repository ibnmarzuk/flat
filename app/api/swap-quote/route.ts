import { NextResponse } from "next/server";
import { createPublicClient, http, parseEther, formatEther } from "viem";
import { getAuthenticatedWallet } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { TESTNET_CHAIN_ID, TESTNET_RPC } from "@/lib/testnet-swap";
import { TRADE_ROUTER, TRADE_FACTORY, TRADE_PAIR, TRADE_WETH, TRADE_TOKEN } from "@/lib/testnet-trade";
import { tradeAbi, type TradeQuote } from "@/lib/testnet-dex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const client = createPublicClient({ transport: http(process.env.ROBINHOOD_TESTNET_RPC_URL || TESTNET_RPC,
  { timeout: 10_000, retryCount: 0 }) });
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 512) return fail("Request too large.", 413);
  try {
    const raw = await request.text();
    if (raw.length > 512) return fail("Request too large.", 413);
    let input: { direction?: unknown; amount?: unknown } | null;
    try { input = JSON.parse(raw); } catch { return fail("Send a valid JSON request.", 400); }
    if (!input || !["buy", "sell"].includes(String(input.direction)) || typeof input.amount !== "string" ||
        input.amount.length > 40 || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(input.amount)) return fail("Enter a positive swap amount with up to 18 decimals.", 400);
    const amountIn = parseEther(input.amount);
    if (amountIn <= 0n) return fail("Enter an amount above zero.", 400);
    const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!wallet) return fail("Verify your wallet to quote a testnet swap.", 401);
    const rate = await consumeWalletRateLimit("testnet_swap_quote", wallet, 120, 600);
    if (!rate.allowed) return fail("Too many quote requests. Please wait before retrying.", 429);
    if (await client.getChainId() !== TESTNET_CHAIN_ID) return fail("The quote provider must use Robinhood Chain testnet (46630).", 503);
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const read = { abi: tradeAbi, blockNumber };
    const [routerFactory, routerWeth, registeredPair, token0, token1, reserves] = await Promise.all([
      client.readContract({ ...read, address: TRADE_ROUTER, functionName: "factory" }),
      client.readContract({ ...read, address: TRADE_ROUTER, functionName: "WETH" }),
      client.readContract({ ...read, address: TRADE_FACTORY, functionName: "getHoard", args: [TRADE_WETH, TRADE_TOKEN] }),
      client.readContract({ ...read, address: TRADE_PAIR, functionName: "token0" }),
      client.readContract({ ...read, address: TRADE_PAIR, functionName: "token1" }),
      client.readContract({ ...read, address: TRADE_PAIR, functionName: "getReserves" })
    ]);
    if (routerFactory.toLowerCase() !== TRADE_FACTORY || routerWeth.toLowerCase() !== TRADE_WETH || registeredPair.toLowerCase() !== TRADE_PAIR ||
        token0.toLowerCase() !== TRADE_WETH || token1.toLowerCase() !== TRADE_TOKEN) return fail("The configured testnet pool could not be validated.", 503);
    const buy = input.direction === "buy";
    const reserveIn = reserves[buy ? 0 : 1], reserveOut = reserves[buy ? 1 : 0];
    if (reserveIn === 0n || reserveOut === 0n) return fail("The testnet pool has no liquidity. Please try later.", 422);
    if (amountIn * 100n > reserveIn * 2n) return fail(`Use a smaller demo amount: at most ${formatEther(reserveIn / 50n)} ${buy ? "Test ETH" : "Test LOX"} for this pool.`, 422);
    const path = buy ? [TRADE_WETH, TRADE_TOKEN] as const : [TRADE_TOKEN, TRADE_WETH] as const;
    const amounts = await client.readContract({ ...read, address: TRADE_ROUTER, functionName: "getAmountsOut", args: [amountIn, path] });
    const amountOut = amounts[1], minimumOut = amountOut * 99n / 100n;
    if (amounts[0] !== amountIn || !amountOut || minimumOut <= 0n) return fail("This amount is too small to swap.", 422);
    const now = Date.now();
    const quote: TradeQuote = { direction: buy ? "buy" : "sell", amountIn: amountIn.toString(), amountOut: amountOut.toString(),
      minimumOut: minimumOut.toString(), deadline: Math.floor(now / 1000) + 300, expiresAt: now + 30_000,
      priceEffectBps: Number(10_000n - amountOut * reserveIn * 10_000n / (amountIn * reserveOut)), chainId: TESTNET_CHAIN_ID };
    return NextResponse.json({ walletAddress: wallet, quote }, { headers });
  } catch { return fail("Testnet quotes are temporarily unavailable. Please retry.", 503); }
}
