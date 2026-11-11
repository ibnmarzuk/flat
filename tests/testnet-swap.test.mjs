import assert from "node:assert/strict";
import test from "node:test";
import { findTestnetSwap, TESTNET_WETH, TESTNET_CHAIN_ID, DEPOSIT_SELECTOR, WITHDRAW_SELECTOR, DEPOSIT_TOPIC, WITHDRAW_TOPIC } from "../lib/testnet-swap.js";
const wallet = "0x1234567890123456789012345678901234567890";
const other = "0x2234567890123456789012345678901234567890";
const amount = 100000000000000n;
const word = (n) => n.toString(16).padStart(64, "0");
const event = (topic, owner = wallet, value = amount) => ({ address: TESTNET_WETH,
  topics: [topic, "0x" + owner.slice(2).padStart(64, "0")], data: "0x" + word(value) });
const receipt = { from: wallet, to: TESTNET_WETH, logs: [event(DEPOSIT_TOPIC)] };
const transaction = { from: wallet, to: TESTNET_WETH, input: DEPOSIT_SELECTOR, value: amount };

test("demo is pinned to Robinhood Chain testnet", () => assert.equal(TESTNET_CHAIN_ID, 46630));
test("accepts the owner's exact deposit amount and the WETH9 fallback", () => {
  assert.deepEqual(findTestnetSwap(receipt, transaction), { direction: "wrap", amount: amount.toString() });
  assert.deepEqual(findTestnetSwap(receipt, { ...transaction, input: "0x" }), { direction: "wrap", amount: amount.toString() });
});
test("accepts an unwrap only with matching withdraw calldata and event", () => {
  const r = { ...receipt, logs: [event(WITHDRAW_TOPIC)] };
  const tx = { ...transaction, input: WITHDRAW_SELECTOR + word(amount), value: 0n };
  assert.deepEqual(findTestnetSwap(r, tx), { direction: "unwrap", amount: amount.toString() });
  assert.equal(findTestnetSwap(r, { ...tx, value: 1n }), null);
  assert.equal(findTestnetSwap(r, { ...tx, input: WITHDRAW_SELECTOR + word(1n) }), null);
  assert.equal(findTestnetSwap(r, { ...tx, input: tx.input + "00" }), null);
});
test("rejects faucet claims, ordinary transfers, approvals and zero conversions", () => {
  assert.equal(findTestnetSwap({ ...receipt, logs: [] }, transaction), null);
  assert.equal(findTestnetSwap(receipt, { ...transaction, input: "0xa9059cbb" + word(amount) }), null);
  assert.equal(findTestnetSwap(receipt, { ...transaction, input: "0x095ea7b3" + word(amount) }), null);
  assert.equal(findTestnetSwap(receipt, { ...transaction, value: 0n }), null);
});
test("rejects other wallets, contracts and forged/mismatched/removed events", () => {
  assert.equal(findTestnetSwap(receipt, { ...transaction, from: other }), null);
  assert.equal(findTestnetSwap(receipt, { ...transaction, to: other }), null);
  assert.equal(findTestnetSwap({ ...receipt, to: other }, transaction), null);
  for (const log of [event(DEPOSIT_TOPIC, other), event(DEPOSIT_TOPIC, wallet, 1n),
    { ...event(DEPOSIT_TOPIC), address: other }, { ...event(DEPOSIT_TOPIC), removed: true },
    { ...event(DEPOSIT_TOPIC), data: "0x01" }, { ...event(DEPOSIT_TOPIC), topics: [DEPOSIT_TOPIC] },
    event(WITHDRAW_TOPIC)]) {
    assert.equal(findTestnetSwap({ ...receipt, logs: [log] }, transaction), null);
  }
  assert.equal(findTestnetSwap({ ...receipt, logs: [event(DEPOSIT_TOPIC), event(DEPOSIT_TOPIC)] }, transaction), null);
});
