/**
 * Validate that the transaction and receipt returned by an RPC describe the
 * same mined transaction. This checks public chain data, not wallet ownership.
 */

/**
 * @param {{ transactionHash?: unknown, blockHash?: unknown, blockNumber?: unknown }} receipt
 * @param {{ hash?: unknown, blockHash?: unknown, blockNumber?: unknown }} transaction
 * @param {string} requestedHash
 */
export function hasConsistentTransactionEvidence(receipt, transaction, requestedHash) {
  const hashPattern = /^0x[a-fA-F0-9]{64}$/;
  const blockPattern = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
  if (
    typeof receipt.transactionHash !== "string" ||
    typeof transaction.hash !== "string" ||
    typeof receipt.blockHash !== "string" ||
    typeof transaction.blockHash !== "string" ||
    typeof receipt.blockNumber !== "string" ||
    typeof transaction.blockNumber !== "string"
  ) return false;

  if (
    !hashPattern.test(receipt.transactionHash) ||
    !hashPattern.test(transaction.hash) ||
    !hashPattern.test(receipt.blockHash) ||
    !hashPattern.test(transaction.blockHash) ||
    !blockPattern.test(receipt.blockNumber) ||
    !blockPattern.test(transaction.blockNumber)
  ) return false;

  return (
    receipt.transactionHash.toLowerCase() === requestedHash.toLowerCase() &&
    transaction.hash.toLowerCase() === requestedHash.toLowerCase() &&
    receipt.blockHash.toLowerCase() === transaction.blockHash.toLowerCase() &&
    BigInt(receipt.blockNumber) === BigInt(transaction.blockNumber)
  );
}

/**
 * @param {string} latestBlockHex
 * @param {string} includedBlockHex
 * @returns {bigint | null}
 */
export function getConfirmationCount(latestBlockHex, includedBlockHex) {
  const blockPattern = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
  if (!blockPattern.test(latestBlockHex) || !blockPattern.test(includedBlockHex)) return null;
  const latest = BigInt(latestBlockHex);
  const included = BigInt(includedBlockHex);
  if (latest < included) return null;
  return latest - included + 1n;
}
