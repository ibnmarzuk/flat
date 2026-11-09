import { NextResponse } from "next/server";
import { createPublicClient, http, TransactionReceiptNotFoundError, type Hash } from "viem";
import { getAuthenticatedWallet } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { getWifProgress, saveWifProof, WifTransactionUsedError } from "@/lib/wif-progress";
import { findWifTransfer, getWifWeek, WIF_CHAIN_ID, WIF_RPC_URL } from "@/lib/weekly-wif";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const headers = { "Cache-Control": "no-store" };
const mainnet = createPublicClient({
  transport: http(process.env.ROBINHOOD_MAINNET_RPC_URL || WIF_RPC_URL, { timeout: 10_000, retryCount: 0 })
});

function failure(error: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { ...headers, ...extraHeaders } });
}

export async function GET(request: Request) {
  try {
    const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!wallet) return failure("Verify your wallet to see your weekly progress.", 401);
    return NextResponse.json({ walletAddress: wallet, progress: await getWifProgress(wallet) }, { headers });
  } catch {
    return failure("Weekly progress is temporarily unavailable. Try again.", 503);
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 1024) return failure("Request body is too large.", 413);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return failure("Request body is too large.", 413);
    body = JSON.parse(raw);
  } catch {
    return failure("Send a valid JSON request.", 400);
  }
  const input = body && typeof body === "object"
    ? body as { transactionHash?: unknown; walletAddress?: unknown }
    : null;
  if (!input || typeof input.transactionHash !== "string" || !HASH_PATTERN.test(input.transactionHash)) {
    return failure("Enter a valid transaction hash.", 400);
  }
  if (!isValidWalletAddress(input.walletAddress)) return failure("Verify your wallet first.", 400);
  const hash = input.transactionHash.toLowerCase() as Hash;
  const address = input.walletAddress.toLowerCase();

  try {
    const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!wallet || wallet !== address) return failure("Sign in with the wallet that sent the WIF.", 401);
    const rate = await consumeWalletRateLimit("wif_weekly_verify", wallet, 12, 3600);
    if (!rate.allowed) {
      return failure("Too many proof checks. Try again later.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
    }

    if (await mainnet.getChainId() !== WIF_CHAIN_ID) {
      return failure("The verification service is connected to the wrong network.", 503);
    }
    const receipt = await mainnet.getTransactionReceipt({ hash });
    if (receipt.transactionHash.toLowerCase() !== hash) {
      return failure("The network returned inconsistent receipt data. Try again.", 503);
    }
    if (receipt.status !== "success") return failure("This transaction failed on Robinhood Chain.", 422);
    if (receipt.from.toLowerCase() !== wallet) return failure("This transaction was sent by a different wallet.", 403);
    const transfer = findWifTransfer(receipt.logs, wallet);
    if (!transfer) return failure("This receipt needs a positive transfer of the official WIF token from your wallet to another wallet.", 422);

    const [block, latestBlock] = await Promise.all([
      mainnet.getBlock({ blockNumber: receipt.blockNumber, includeTransactions: false }),
      mainnet.getBlockNumber({ cacheTime: 0 })
    ]);
    if (block.hash !== receipt.blockHash || !block.transactions.some((tx) => tx.toLowerCase() === hash)) {
      return failure("The transaction block changed. Wait for the receipt to settle and retry.", 409);
    }
    const confirmations = latestBlock - receipt.blockNumber + 1n;
    if (confirmations < 2n) return failure("Wait for at least two confirmations before verifying.", 409);
    const blockTime = new Date(Number(block.timestamp) * 1000).toISOString();
    const week = getWifWeek();
    if (blockTime < week.start || blockTime >= week.end) {
      return failure("The transfer must be confirmed during the current weekly challenge.", 422);
    }

    const outcome = await saveWifProof(wallet, {
      transactionHash: hash,
      weekStart: week.start,
      recipient: transfer.recipient,
      amount: transfer.amount,
      blockNumber: receipt.blockNumber.toString(),
      confirmations: Number(confirmations),
      blockTime
    });
    return NextResponse.json({
      walletAddress: wallet,
      progress: await getWifProgress(wallet),
      alreadyCompleted: outcome === "week-complete"
    }, { headers });
  } catch (error) {
    if (error instanceof WifTransactionUsedError) return failure("This transaction has already been used as proof.", 409);
    if (error instanceof TransactionReceiptNotFoundError) {
      return failure("This receipt is pending or unavailable on Robinhood Chain mainnet. Check the hash and try again after confirmation.", 409);
    }
    return failure("WIF verification is temporarily unavailable. Try again.", 503);
  }
}
