import test from "node:test";
import assert from "node:assert/strict";
import { hasConsistentTransactionEvidence, getConfirmationCount } from "../lib/transaction-verification.js";

const hash = "0x" + "a".repeat(64);
const blockHash = "0x" + "b".repeat(64);
const receipt = { transactionHash: hash, blockHash, blockNumber: "0x10" };
const transaction = { hash, blockHash, blockNumber: "0x10" };

test("accepts matching receipt and transaction evidence", () => {
  assert.equal(hasConsistentTransactionEvidence(receipt, transaction, hash), true);
});

test("rejects a receipt for a different transaction", () => {
  assert.equal(hasConsistentTransactionEvidence({ ...receipt, transactionHash: "0x" + "c".repeat(64) }, transaction, hash), false);
});

test("rejects mismatched block hashes", () => {
  assert.equal(hasConsistentTransactionEvidence(receipt, { ...transaction, blockHash: "0x" + "c".repeat(64) }, hash), false);
});

test("rejects malformed block numbers", () => {
  assert.equal(hasConsistentTransactionEvidence({ ...receipt, blockNumber: "latest" }, transaction, hash), false);
});

test("counts the inclusion block as the first confirmation", () => {
  assert.equal(getConfirmationCount("0x11", "0x10"), 2n);
});

test("rejects a latest block lower than the included block", () => {
  assert.equal(getConfirmationCount("0xf", "0x10"), null);
});

test("rejects malformed block heights", () => {
  assert.equal(getConfirmationCount("not-hex", "0x10"), null);
});

test("matches transaction hashes without case sensitivity", () => {
  const upperHash = hash.toUpperCase().replace("0X", "0x");
  assert.equal(hasConsistentTransactionEvidence({ ...receipt, transactionHash: upperHash }, { ...transaction, hash: upperHash }, hash), true);
});

test("rejects a transaction from another block number", () => {
  assert.equal(hasConsistentTransactionEvidence(receipt, { ...transaction, blockNumber: "0x11" }, hash), false);
});

test("rejects a malformed transaction hash in the receipt", () => {
  assert.equal(hasConsistentTransactionEvidence({ ...receipt, transactionHash: "0x1234" }, transaction, hash), false);
});

test("returns one confirmation when latest and included blocks are equal", () => {
  assert.equal(getConfirmationCount("0x10", "0x10"), 1n);
});

test("returns null for a block height with a leading zero", () => {
  assert.equal(getConfirmationCount("0x010", "0x10"), null);
});
