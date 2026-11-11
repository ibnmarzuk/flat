import { NextResponse } from "next/server";
import { getConfirmationCount, hasConsistentTransactionEvidence, hasMinimumConfirmations, isExpectedChainId, isSuccessfulReceipt, isTransactionSender } from "@/lib/transaction-verification";
import { getAuthenticatedWallet } from "@/lib/auth";
import { consumeWalletRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.ROBINHOOD_TESTNET_RPC_URL ||
  "https://rpc.testnet.chain.robinhood.com";
const EXPECTED_CHAIN_ID = "0xb626";
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

type RpcResponse<T> = { result?: T; error?: { message?: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error("The network provider is temporarily unavailable.");
  const payload = (await response.json()) as RpcResponse<T>;
  if (payload.error) throw new Error(payload.error.message || "Network request failed.");
  if (payload.result === undefined) throw new Error("The network returned an incomplete response.");
  return payload.result;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 2_048) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 2_048) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { questId, transactionHash, walletAddress } = body as {
    questId?: unknown;
    transactionHash?: unknown;
    walletAddress?: unknown;
  };

  // This verifier intentionally supports only the generic successful-transaction quest.
  // It does not claim that the transaction performed a specific contract action.
  if (questId !== "prove-transaction") {
    return NextResponse.json({ error: "This verification method is not enabled for that quest." }, { status: 400 });
  }

  if (typeof transactionHash !== "string" || !HASH_PATTERN.test(transactionHash)) {
    return NextResponse.json({ error: "Enter a valid 32-byte transaction hash." }, { status: 400 });
  }
  if (typeof walletAddress !== "string" || !ADDRESS_PATTERN.test(walletAddress)) {
    return NextResponse.json({ error: "Connect a valid wallet address first." }, { status: 400 });
  }

  try {
    const authenticatedWallet = await getAuthenticatedWallet(request.headers.get("cookie"));
    if (!authenticatedWallet || authenticatedWallet.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Sign in with the wallet that sent this transaction before submitting proof." }, { status: 401 });
    }

    const rate = await consumeWalletRateLimit("transaction_verify", walletAddress, 10, 3600);
    if (!rate.allowed) return NextResponse.json({ error: "Too many proof checks. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const chainId = await rpc<string>("eth_chainId", []);
    if (!isExpectedChainId(chainId, EXPECTED_CHAIN_ID)) {
      return NextResponse.json({ error: "The configured RPC is not Robinhood Chain testnet." }, { status: 503 });
    }

    const [receipt, transaction, latestBlockHex] = await Promise.all([
      rpc<{
        status: string;
        blockNumber: string;
        blockHash: string;
        transactionHash: string;
      } | null>("eth_getTransactionReceipt", [transactionHash]),
      rpc<{
        from: string;
        hash: string;
        blockNumber: string | null;
        blockHash: string | null;
        to: string | null;
        input: string;
        value: string;
      } | null>("eth_getTransactionByHash", [transactionHash]),
      rpc<string>("eth_blockNumber", []),
    ]);

    if (!receipt || !transaction) {
      return NextResponse.json({ error: "Transaction not found on Robinhood Chain testnet." }, { status: 404 });
    }
    if (!hasConsistentTransactionEvidence(receipt, transaction, transactionHash)) {
      return NextResponse.json({ error: "The network returned inconsistent transaction evidence. Try again." }, { status: 503 });
    }
    if (!isSuccessfulReceipt(receipt.status)) {
      return NextResponse.json({ error: "This transaction did not succeed." }, { status: 422 });
    }
    if (
      !isTransactionSender(transaction.from, walletAddress)
    ) {
      return NextResponse.json({ error: "The transaction sender does not match your connected wallet." }, { status: 403 });
    }

    const confirmationCount = getConfirmationCount(latestBlockHex, receipt.blockNumber);
    if (confirmationCount === null || confirmationCount > BigInt(Number.MAX_SAFE_INTEGER)) {
      return NextResponse.json({ error: "The network returned an invalid block height. Try again." }, { status: 503 });
    }

    const includedBlock = BigInt(receipt.blockNumber);
    const confirmations = Number(confirmationCount);
    if (!hasMinimumConfirmations(confirmationCount, 2n)) {
      return NextResponse.json({
        error: "This transaction needs at least 2 confirmations. Try again shortly.",
        confirmations,
      }, { status: 409 });
    }

    const db = (await import("@/lib/db")).getDb();
    const normalizedTransactionHash = receipt.transactionHash.toLowerCase();
    await db.begin(async (tx) => {
      const completionRows = await tx<{ id: string }[]>`
        insert into public.completions (wallet_address, quest_id, status, submitted_at, verified_at)
        select ${walletAddress.toLowerCase()}, id, 'verified', now(), now()
        from public.quests where slug = 'prove-transaction'
        on conflict (wallet_address, quest_id) do update
          set status = 'verified', submitted_at = coalesce(public.completions.submitted_at, now()),
              verified_at = now(), updated_at = now()
        returning id
      `;
      const completion = completionRows[0];
      if (!completion) throw new Error("Quest record unavailable.");
      await tx`
        insert into public.verification_records
          (completion_id, chain_id, wallet_address, transaction_hash, block_number, confirmations, verification_method, evidence, verified_at)
        values (
          ${completion.id}, 46630, ${walletAddress.toLowerCase()}, ${normalizedTransactionHash},
          ${Number(includedBlock)}, ${confirmations},
          'successful_receipt_sender_match_two_confirmations_with_block_consistency',
          ${JSON.stringify({ blockHash: receipt.blockHash, transactionTo: transaction.to, transactionValue: transaction.value, inputDataBytes: Math.max(0, (transaction.input.length - 2) / 2) })}::jsonb,
          now()
        )
        on conflict (chain_id, lower(transaction_hash)) where transaction_hash is not null do update
          set completion_id = excluded.completion_id,
              wallet_address = excluded.wallet_address,
              block_number = excluded.block_number,
              confirmations = excluded.confirmations,
              verification_method = excluded.verification_method,
              evidence = public.verification_records.evidence || excluded.evidence,
              verified_at = now()
      `;
    });

    return NextResponse.json({
      verified: true,
      questId: "prove-transaction",
      proofScope: "successful_wallet_transaction",
      chainId: 46630,
      transactionHash: receipt.transactionHash,
      walletAddress,
      blockNumber: Number(includedBlock),
      blockHash: receipt.blockHash,
      transactionTo: transaction.to,
      transactionValue: transaction.value,
      inputDataBytes: Math.max(0, (transaction.input.length - 2) / 2),
      confirmations,
      verificationMethod: "successful_receipt_sender_match_two_confirmations_with_block_consistency",
      verifiedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "The verification service or network provider is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
