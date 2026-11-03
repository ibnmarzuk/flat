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
