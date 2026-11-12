const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** @param {number} xp */
export function getJourneyLevel(xp) {
  const value = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  if (value >= 150) return { name: "WIF Guide", minimum: 150, next: null };
  if (value >= 75) return { name: "Builder", minimum: 75, next: 150 };
  if (value >= 25) return { name: "Explorer", minimum: 25, next: 75 };
  return { name: "Newcomer", minimum: 0, next: 25 };
}

/** Monday 00:00 UTC keeps the same weekly window for every wallet. @param {Date | string | number} value */
export function getJourneyWeek(value = new Date()) {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid journey date.");
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  return start.toISOString();
}

/** A user keeps last week's streak until the current week ends without an action.
 * @param {Date | string | number} now @param {Iterable<Date | string | number>} verifiedAt
 */
export function getJourneyStreak(now, verifiedAt) {
  const completed = new Set(Array.from(verifiedAt, getJourneyWeek));
  let cursor = Date.parse(getJourneyWeek(now));
  if (!completed.has(new Date(cursor).toISOString())) cursor -= WEEK_MS;
  let streak = 0;
  while (completed.has(new Date(cursor).toISOString())) {
    streak += 1;
    cursor -= WEEK_MS;
  }
  return streak;
}

/** Alternate between two fully verified, faucet-funded quests. @param {Date | string | number} now */
export function getQuestRotation(now = new Date()) {
  const week = Math.floor(Date.parse(getJourneyWeek(now)) / WEEK_MS);
  return week % 2 === 0
    ? { slug: "swap", title: "Liquidity Scout", action: "Swap Test ETH ↔ Test LOX", reward: 1 }
    : { slug: "send", title: "Token Courier", action: "Send Test LOX to another wallet", reward: 2 };
}

/** @param {{walletVerified?: boolean,addressProven?: boolean,testnetTradeCount?: number,testnetSendCount?: number,referralCount?: number}} progress @param {number} streak */
export function getJourneyBadges(progress, streak) {
  return [
    { name: "Onchain ID", unlocked: !!progress.walletVerified },
    { name: "First Proof", unlocked: !!progress.addressProven },
    { name: "Liquidity Scout", unlocked: (progress.testnetTradeCount || 0) > 0 },
    { name: "Token Courier", unlocked: (progress.testnetSendCount || 0) > 0 },
    { name: "Quest Streak", unlocked: streak >= 2 },
    { name: "Community Spark", unlocked: (progress.referralCount || 0) > 0 }
  ];
}
