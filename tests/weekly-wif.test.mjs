import assert from "node:assert/strict";
import test from "node:test";
import {
  findWifTransfer, getWifStreak, getWifWeek, WIF_TOKEN, WIF_TRANSFER_TOPIC, ZERO_ADDRESS
} from "../lib/weekly-wif.js";

const sender = "0x" + "ab".repeat(20);
const recipient = "0x" + "cd".repeat(20);
const topic = (address) => "0x" + address.slice(2).padStart(64, "0");
const transfer = {
  address: WIF_TOKEN,
  topics: [WIF_TRANSFER_TOPIC, topic(sender), topic(recipient)],
  data: "0x" + "2a".padStart(64, "0")
};

test("weekly quest rolls over at midnight UTC on Monday", () => {
  const previous = getWifWeek(new Date("2026-11-15T23:59:59.999Z"));
  const next = getWifWeek(new Date("2026-11-16T00:00:00.000Z"));
  assert.deepEqual(previous, { start: "2026-11-09T00:00:00.000Z", end: next.start });
  assert.equal(next.end, "2026-11-23T00:00:00.000Z");
});

test("streak survives the start of a new week and resets after a missed week", () => {
  const oct26 = getWifWeek(new Date("2026-10-26")).start;
  const nov2 = getWifWeek(new Date("2026-11-02")).start;
  const nov9 = getWifWeek(new Date("2026-11-09")).start;
  const nov16 = getWifWeek(new Date("2026-11-16")).start;
  assert.equal(getWifStreak(nov9, [oct26, nov2]), 2);
  assert.equal(getWifStreak(nov9, [oct26, nov2, nov9, nov9]), 3);
  assert.equal(getWifStreak(nov16, [oct26, nov2]), 0);
  assert.equal(getWifStreak(nov16, [oct26, nov2, nov16]), 1);
});

test("reads a positive transfer from the WIF token and the expected wallet", () => {
  assert.deepEqual(findWifTransfer([transfer], "0x" + sender.slice(2).toUpperCase()), {
    recipient,
    amount: "42"
  });
});

test("rejects lookalike token, wrong sender, malformed data, and removed logs", () => {
  assert.equal(findWifTransfer([{ ...transfer, address: recipient }], sender), null);
  assert.equal(findWifTransfer([transfer], recipient), null);
  assert.equal(findWifTransfer([{ ...transfer, data: "0x2a" }], sender), null);
  assert.equal(findWifTransfer([{ ...transfer, removed: true }], sender), null);
  assert.equal(findWifTransfer([{ ...transfer, topics: [...transfer.topics, topic(sender)] }], sender), null);
});

test("rejects self transfers, burns, mints, token recipients, and zero amounts", () => {
  for (const invalidRecipient of [sender, ZERO_ADDRESS, WIF_TOKEN]) {
    assert.equal(findWifTransfer([{ ...transfer, topics: [WIF_TRANSFER_TOPIC, topic(sender), topic(invalidRecipient)] }], sender), null);
  }
  assert.equal(findWifTransfer([{ ...transfer, topics: [WIF_TRANSFER_TOPIC, topic(ZERO_ADDRESS), topic(recipient)] }], ZERO_ADDRESS), null);
  assert.equal(findWifTransfer([{ ...transfer, data: "0x" + "0".repeat(64) }], sender), null);
});
