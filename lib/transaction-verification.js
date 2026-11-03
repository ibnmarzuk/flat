/**
 * Validate that the transaction and receipt returned by an RPC describe the
 * same mined transaction. This checks public chain data, not wallet ownership.
 */

/**
 * @param {unknown} receipt
 * @param {unknown} transaction
 * @param {unknown} requestedHash
 */
export function hasConsistentTransactionEvidence(receipt, transaction, requestedHash) {
  const hashPattern = /^0x[a-fA-F0-9]{64}$/;
  const blockPattern = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
  if (
    !receipt || typeof receipt !== "object" ||
    !transaction || typeof transaction !== "object" ||
    typeof requestedHash !== "string" || !hashPattern.test(requestedHash)
  ) return false;

  const evidence = /** @type {{ transactionHash?: unknown, blockHash?: unknown, blockNumber?: unknown }} */ (receipt);
  const tx = /** @type {{ hash?: unknown, blockHash?: unknown, blockNumber?: unknown }} */ (transaction);

  if (
    typeof evidence.transactionHash !== "string" ||
    typeof tx.hash !== "string" ||
    typeof evidence.blockHash !== "string" ||
    typeof tx.blockHash !== "string" ||
    typeof evidence.blockNumber !== "string" ||
    typeof tx.blockNumber !== "string"
  ) return false;

  if (
    !hashPattern.test(evidence.transactionHash) ||
    !hashPattern.test(tx.hash) ||
    !hashPattern.test(evidence.blockHash) ||
    !hashPattern.test(tx.blockHash) ||
    !blockPattern.test(evidence.blockNumber) ||
    !blockPattern.test(tx.blockNumber)
  ) return false;

  return (
    evidence.transactionHash.toLowerCase() === requestedHash.toLowerCase() &&
    tx.hash.toLowerCase() === requestedHash.toLowerCase() &&
    evidence.blockHash.toLowerCase() === tx.blockHash.toLowerCase() &&
    BigInt(evidence.blockNumber) === BigInt(tx.blockNumber)
  );
}

/**
 * @param {unknown} latestBlockHex
 * @param {unknown} includedBlockHex
 * @returns {bigint | null}
 */
export function getConfirmationCount(latestBlockHex, includedBlockHex) {
  const blockPattern = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
  if (
    typeof latestBlockHex !== "string" ||
    typeof includedBlockHex !== "string" ||
    !blockPattern.test(latestBlockHex) ||
    !blockPattern.test(includedBlockHex)
  ) return null;
  const latest = BigInt(latestBlockHex);
  const included = BigInt(includedBlockHex);
  if (latest < included) return null;
  return latest - included + 1n;
}

/** Chain and wallet policy checks used by the transaction verification route. */
export function isExpectedChainId(chainId, expectedChainId = "0xb626") {
  return typeof chainId === "string" && chainId.toLowerCase() === expectedChainId.toLowerCase();
}

export function isSuccessfulReceipt(status) {
  return status === "0x1";
}

export function isTransactionSender(transactionFrom, walletAddress) {
  return typeof transactionFrom === "string" &&
    typeof walletAddress === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(transactionFrom) &&
    /^0x[a-fA-F0-9]{40}$/.test(walletAddress) &&
    transactionFrom.toLowerCase() === walletAddress.toLowerCase();
}

export function hasMinimumConfirmations(confirmations, minimum = 2n) {
  return typeof confirmations === "bigint" && confirmations >= minimum;
}
