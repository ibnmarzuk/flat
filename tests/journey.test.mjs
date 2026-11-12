import test from "node:test";
import assert from "node:assert/strict";
import { getJourneyBadges, getJourneyLevel, getJourneyStreak, getJourneyWeek, getQuestRotation } from "../lib/journey.js";

test("maps XP to the four WIF journey levels", () => {
  assert.equal(getJourneyLevel(0).name, "Newcomer");
  assert.equal(getJourneyLevel(25).name, "Explorer");
  assert.equal(getJourneyLevel(75).name, "Builder");
  assert.equal(getJourneyLevel(150).name, "WIF Guide");
});

test("uses Monday UTC weeks and counts consecutive verified weeks", () => {
  assert.equal(getJourneyWeek("2026-11-11T12:00:00Z"), "2026-11-09T00:00:00.000Z");
  assert.equal(getJourneyStreak("2026-11-11T12:00:00Z", [
    "2026-11-10T08:00:00Z", "2026-11-03T08:00:00Z", "2026-10-27T08:00:00Z"
  ]), 3);
  assert.equal(getJourneyStreak("2026-11-11T12:00:00Z", ["2026-11-03T08:00:00Z"]), 1);
  assert.equal(getJourneyStreak("2026-11-11T12:00:00Z", ["2026-10-20T08:00:00Z"]), 0);
});

test("rotates only between verified faucet-funded quests", () => {
  const first = getQuestRotation("2026-11-11T12:00:00Z");
  const second = getQuestRotation("2026-11-18T12:00:00Z");
  assert.notEqual(first.slug, second.slug);
  assert.deepEqual(new Set([first.slug, second.slug]), new Set(["swap", "send"]));
});

test("unlocks badges from server-derived progress", () => {
  const badges = getJourneyBadges({ walletVerified: true, testnetTradeCount: 1, referralCount: 1 }, 2);
  assert.equal(badges.find((badge) => badge.name === "Onchain ID")?.unlocked, true);
  assert.equal(badges.find((badge) => badge.name === "Token Courier")?.unlocked, false);
  assert.equal(badges.find((badge) => badge.name === "Community Spark")?.unlocked, true);
});
