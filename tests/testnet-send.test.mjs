import test from "node:test";
import assert from "node:assert/strict";
import { TRADE_TOKEN, TRADE_TRANSFER_TOPIC } from "../lib/testnet-trade.js";
import { buildTokenTransferData, findTestnetSend } from "../lib/testnet-send.js";

const wallet = "0x1234567890123456789012345678901234567890";
const recipient = "0x2234567890123456789012345678901234567890";
const other = "0x3234567890123456789012345678901234567890";
const amount = 1000000000000000n;
const topic = (address) => "0x" + address.slice(2).padStart(64, "0");
const transfer = (from = wallet, to = recipient, value = amount) => ({
  address: TRADE_TOKEN, topics: [TRADE_TRANSFER_TOPIC, topic(from), topic(to)],
  data: "0x" + value.toString(16).padStart(64, "0")
});
const tx = { from: wallet, to: TRADE_TOKEN, input: buildTokenTransferData(recipient, amount), value: 0n };
const receipt = { from: wallet, to: TRADE_TOKEN, logs: [transfer()] };

test("accepts a direct Test LOX transfer with matching settlement", () => {
  assert.deepEqual(findTestnetSend(receipt, tx), { recipient, amount: amount.toString() });
});

test("rejects wrong token, sender, recipient, value and removed or duplicate logs", () => {
  assert.equal(findTestnetSend(receipt, { ...tx, to: other }), null);
  assert.equal(findTestnetSend(receipt, { ...tx, from: other }), null);
  assert.equal(findTestnetSend(receipt, { ...tx, value: 1n }), null);
  assert.equal(findTestnetSend({ ...receipt, logs: [transfer(wallet, other)] }, tx), null);
  assert.equal(findTestnetSend({ ...receipt, logs: [{ ...transfer(), removed: true }] }, tx), null);
  assert.equal(findTestnetSend({ ...receipt, logs: [transfer(), transfer()] }, tx), null);
});

test("rejects self sends, zero amounts and invalid transfer targets", () => {
  assert.throws(() => buildTokenTransferData(wallet, 0n));
  assert.throws(() => buildTokenTransferData(TRADE_TOKEN, amount));
  const selfTx = { ...tx, input: buildTokenTransferData(wallet, amount) };
  assert.equal(findTestnetSend({ ...receipt, logs: [transfer(wallet, wallet)] }, selfTx), null);
});
