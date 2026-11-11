import { createPublicClient, http, TransactionReceiptNotFoundError, type Hash } from "viem";
import { findWifTransfer, WIF_CHAIN_ID, WIF_RPC_URL } from "@/lib/weekly-wif";

const mainnet = createPublicClient({
  transport: http(process.env.ROBINHOOD_MAINNET_RPC_URL || WIF_RPC_URL, { timeout: 10_000, retryCount: 0 })
});

export class WifReceiptError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function checkWifReceipt(hash: Hash, expectedWallet?: string) {
  if (await mainnet.getChainId() !== WIF_CHAIN_ID) {
    throw new WifReceiptError("The verification service is connected to the wrong network.", 503);
  }
  const receipt = await mainnet.getTransactionReceipt({ hash }).catch((error: unknown) => {
    if (error instanceof TransactionReceiptNotFoundError) {
      throw new WifReceiptError("This receipt is pending or unavailable on Robinhood Chain mainnet. Check the hash and try again after confirmation.", 409);
    }
    throw error;
  });

  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    throw new WifReceiptError("The network returned inconsistent receipt data. Try again.", 503);
  }
  if (receipt.status !== "success") throw new WifReceiptError("This transaction failed on Robinhood Chain.", 422);
  const sender = receipt.from.toLowerCase();
  if (expectedWallet && sender !== expectedWallet.toLowerCase()) {
    throw new WifReceiptError("This transaction was sent by a different wallet.", 403);
  }
  const transfer = findWifTransfer(receipt.logs, sender);
  if (!transfer) {
    throw new WifReceiptError("This receipt needs a positive transfer of the official WIF token from the sender to another wallet.", 422);
  }

  const [block, latestBlock] = await Promise.all([
    mainnet.getBlock({ blockNumber: receipt.blockNumber, includeTransactions: false }),
    mainnet.getBlockNumber({ cacheTime: 0 })
  ]);
  if (block.hash !== receipt.blockHash || !block.transactions.some((tx) => tx.toLowerCase() === hash.toLowerCase())) {
    throw new WifReceiptError("The transaction block changed. Wait for the receipt to settle and retry.", 409);
  }
  const confirmations = latestBlock - receipt.blockNumber + 1n;
  if (confirmations < 2n) throw new WifReceiptError("Wait for at least two confirmations before verifying.", 409);

  return {
    ...transfer,
    transactionHash: hash.toLowerCase(),
    blockNumber: receipt.blockNumber.toString(),
    confirmations: Number(confirmations),
    blockTime: new Date(Number(block.timestamp) * 1000).toISOString()
  };
}
