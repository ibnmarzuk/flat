import { NextResponse } from "next/server";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { transactionHash, walletAddress } = body as {
    transactionHash?: unknown;
    walletAddress?: unknown;
  };

  if (typeof transactionHash !== "string" || !HASH_PATTERN.test(transactionHash)) {
    return NextResponse.json({ error: "Enter a valid 32-byte transaction hash." }, { status: 400 });
  }
  if (typeof walletAddress !== "string" || !ADDRESS_PATTERN.test(walletAddress)) {
    return NextResponse.json({ error: "Connect a valid wallet address first." }, { status: 400 });
  }

  try {
    const chainId = await rpc<string>("eth_chainId", []);
    if (chainId.toLowerCase() !== EXPECTED_CHAIN_ID) {
      return NextResponse.json({ error: "The configured RPC is not Robinhood Chain testnet." }, { status: 503 });
    }

    const [receipt, transaction, latestBlockHex] = await Promise.all([
      rpc<{
        status: string;
        blockNumber: string;
        blockHash: string;
        transactionHash: string;
        from: string;
      } | null>("eth_getTransactionReceipt", [transactionHash]),
      rpc<{ from: string; hash: string } | null>("eth_getTransactionByHash", [transactionHash]),
      rpc<string>("eth_blockNumber", []),
    ]);

    if (!receipt || !transaction) {
      return NextResponse.json({ error: "Transaction not found on Robinhood Chain testnet." }, { status: 404 });
    }
    if (receipt.status !== "0x1") {
      return NextResponse.json({ error: "This transaction did not succeed." }, { status: 422 });
    }
    if (
      receipt.from.toLowerCase() !== walletAddress.toLowerCase() ||
      transaction.from.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      return NextResponse.json({ error: "The transaction sender does not match your connected wallet." }, { status: 403 });
    }

    const latestBlock = BigInt(latestBlockHex);
    const includedBlock = BigInt(receipt.blockNumber);
    if (latestBlock < includedBlock) {
      return NextResponse.json({ error: "The network returned an inconsistent block height. Try again." }, { status: 503 });
    }

    const confirmations = Number(latestBlock - includedBlock + 1n);
    if (confirmations < 2) {
      return NextResponse.json({
        error: "This transaction needs at least 2 confirmations. Try again shortly.",
        confirmations,
      }, { status: 409 });
    }

    return NextResponse.json({
      verified: true,
      chainId: 46630,
      transactionHash: receipt.transactionHash,
      walletAddress,
      blockNumber: Number(includedBlock),
      blockHash: receipt.blockHash,
      confirmations,
      verificationMethod: "successful_receipt_sender_match_two_confirmations",
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification service failed.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
