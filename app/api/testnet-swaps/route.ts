import { NextResponse } from "next/server";
import { createPublicClient, http, TransactionReceiptNotFoundError, TransactionNotFoundError, type Hash } from "viem";
import { getAuthenticatedWallet } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";
import { TESTNET_CHAIN_ID, TESTNET_RPC } from "@/lib/testnet-swap";
import { findTestnetTrade } from "@/lib/testnet-trade";
import { getXpProgress, getTestnetSwapHistory, hasTestnetSwapProof, saveTestnetSwapProof } from "@/lib/xp-progress";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const testnet = createPublicClient({
  transport: http(process.env.ROBINHOOD_TESTNET_RPC_URL || TESTNET_RPC, { timeout: 10_000, retryCount: 0 })
});
function failure(error: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { ...headers, ...extraHeaders } });
}
async function result(wallet: string) {
  const [progress, proofs] = await Promise.all([getXpProgress(wallet), getTestnetSwapHistory(wallet)]);
  return { walletAddress: wallet, chainId: TESTNET_CHAIN_ID, progress, proofs };
}

export async function GET(request: Request) {
  try {
    const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!wallet) return failure("Verify your wallet to see your demo XP.", 401);
    return NextResponse.json(await result(wallet), { headers });
  } catch {
    return failure("Demo XP is temporarily unavailable.", 503);
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
  if (!input || typeof input.transactionHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(input.transactionHash)) {
    return failure("Enter the full testnet transaction hash.", 400);
  }
  if (!isValidWalletAddress(input.walletAddress)) return failure("Verify your wallet first.", 400);
  const hash = input.transactionHash.toLowerCase() as Hash;
  try {
    const wallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!wallet || wallet !== input.walletAddress.toLowerCase()) return failure("Sign in with the wallet that made this swap.", 401);
    const rate = await consumeWalletRateLimit("testnet_swap_verify", wallet, 60, 3600);
    if (!rate.allowed) return failure("Too many proof checks. Try again later.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
    let alreadyRecorded = await hasTestnetSwapProof(wallet, hash);
    if (!alreadyRecorded) {
      if (await testnet.getChainId() !== TESTNET_CHAIN_ID) return failure("The verification RPC must use Robinhood Chain testnet (46630).", 503);
      const [receipt, transaction] = await Promise.all([
        testnet.getTransactionReceipt({ hash }), testnet.getTransaction({ hash })
      ]);
      if (receipt.transactionHash.toLowerCase() !== hash || transaction.hash.toLowerCase() !== hash ||
          transaction.blockHash !== receipt.blockHash || transaction.blockNumber !== receipt.blockNumber) {
        return failure("Inconsistent transaction evidence. Try again.", 503);
      }
      if (receipt.status !== "success") return failure("This testnet transaction failed.", 422);
      if (receipt.from.toLowerCase() !== wallet) return failure("This swap belongs to a different wallet.", 403);
      const swap = findTestnetTrade(receipt, transaction);
      if (!swap) return failure("Use a completed Test ETH ↔ Test LOX pool swap. Wrapping, faucet claims, approvals and transfers do not count.", 422);
      const [block, head] = await Promise.all([
        testnet.getBlock({ blockNumber: receipt.blockNumber, includeTransactions: false }),
        testnet.getBlockNumber({ cacheTime: 0 })
      ]);
      if (block.hash !== receipt.blockHash || !block.transactions.some((tx) => tx.toLowerCase() === hash)) {
        return failure("The transaction block changed. Wait and retry.", 409);
      }
      const confirmations = head - receipt.blockNumber + 1n;
      if (confirmations < 2n) return failure("Wait for two testnet confirmations, then verify again.", 409);
      if (confirmations > BigInt(Number.MAX_SAFE_INTEGER)) return failure("Invalid network block height.", 503);
      const saved = await saveTestnetSwapProof({ ...swap, walletAddress: wallet, transactionHash: hash,
        blockNumber: receipt.blockNumber, confirmations: Number(confirmations) });
      if (!saved && !await hasTestnetSwapProof(wallet, hash)) return failure("This receipt is already recorded for a different wallet.", 409);
      alreadyRecorded = !saved;
    }
    return NextResponse.json({ ...await result(wallet), transactionHash: hash, alreadyRecorded }, { headers });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError || error instanceof TransactionNotFoundError) {
      return failure("Receipt pending or not found on Robinhood Chain testnet. Check the hash and retry shortly.", 409);
    }
    return failure("Testnet verification is temporarily unavailable. Your hash can be retried safely.", 503);
  }
}
