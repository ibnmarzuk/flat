import { NextResponse } from "next/server";
import { createPublicClient, http, TransactionReceiptNotFoundError, type Hash } from "viem";
import { getAuthenticatedWallet } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { findWifSwap } from "@/lib/wif-swap";
import { WIF_CHAIN_ID, WIF_RPC_URL } from "@/lib/weekly-wif";
import { getXpProgress, hasWifSwapProof, saveWifSwapProof } from "@/lib/xp-progress";
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
    if (!wallet) return failure("Verify your wallet to see your XP.", 401);
    return NextResponse.json({ walletAddress: wallet, progress: await getXpProgress(wallet) }, { headers });
  } catch {
    return failure("Swap XP is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 1024) return failure("Request body too large.", 413);
  let input: { transactionHash?: unknown; walletAddress?: unknown } | null;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return failure("Request body too large.", 413);
    input = JSON.parse(raw);
  } catch {
    return failure("Send a valid JSON request.", 400);
  }
  if (!input || typeof input.transactionHash !== "string" || !HASH_PATTERN.test(input.transactionHash)) {
    return failure("Enter a valid swap transaction hash.", 400);
  }
  if (!isValidWalletAddress(input.walletAddress)) return failure("Verify your wallet first.", 400);
  const hash = input.transactionHash.toLowerCase() as Hash;

  try {
    const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!wallet || wallet !== input.walletAddress.toLowerCase()) {
      return failure("Sign in with the wallet that made this swap.", 401);
    }
    const rate = await consumeWalletRateLimit("wif_swap_verify", wallet, 40, 3600);
    if (!rate.allowed) {
      return failure("Too many proof checks. Try again later.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
    }

    let alreadyRecorded = await hasWifSwapProof(wallet, hash);
    if (!alreadyRecorded) {
      if (await mainnet.getChainId() !== WIF_CHAIN_ID) {
        return failure("The verification service is connected to the wrong network.", 503);
      }
      const receipt = await mainnet.getTransactionReceipt({ hash });
      if (receipt.transactionHash.toLowerCase() !== hash) return failure("Inconsistent receipt data. Try again.", 503);
      if (receipt.status !== "success") return failure("This transaction failed on Robinhood Chain.", 422);
      if (receipt.from.toLowerCase() !== wallet) return failure("This swap was made by a different wallet.", 403);
      const swap = findWifSwap(receipt);
      if (!swap) return failure("Use a completed ETH ↔ WIF swap from the Pons trading pool.", 422);

      const [block, head] = await Promise.all([
        mainnet.getBlock({ blockNumber: receipt.blockNumber, includeTransactions: false }),
        mainnet.getBlockNumber({ cacheTime: 0 })
      ]);
      if (block.hash !== receipt.blockHash || !block.transactions.some((tx) => tx.toLowerCase() === hash)) {
        return failure("The transaction block changed. Wait for the receipt to settle and retry.", 409);
      }
      const confirmations = head - receipt.blockNumber + 1n;
      if (confirmations < 2n) return failure("Wait for two confirmations before verifying.", 409);

      const saved = await saveWifSwapProof({
        ...swap,
        walletAddress: wallet,
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        confirmations: Number(confirmations)
      });
      if (!saved && !await hasWifSwapProof(wallet, hash)) {
        return failure("This transaction is already recorded for a different wallet.", 409);
      }
      alreadyRecorded = !saved;
    }

    return NextResponse.json({
      walletAddress: wallet,
      progress: await getXpProgress(wallet),
      transactionHash: hash,
      alreadyRecorded
    }, { headers });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return failure("Swap receipt pending or unavailable on Robinhood Chain. Check the hash and try again.", 409);
    }
    return failure("Swap verification is temporarily unavailable. Try again.", 503);
  }
}
