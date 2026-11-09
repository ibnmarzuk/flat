export const WIF_CHAIN_ID = 4663;
export const WIF_CHAIN_HEX = "0x1237";
export const WIF_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const WIF_EXPLORER = "https://robinhoodchain.blockscout.com";
export const WIF_TOKEN = "0x5173b8ea6923c2d40267890d45c46a3480954773";
export const WIF_DECIMALS = 18;
export const WIF_QUEST_SLUG = "weekly-wif";
export const WIF_VERIFICATION_METHOD = "weekly_wif_transfer";
export const WIF_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** A week starts Monday at 00:00 UTC and ends at the next Monday. */
export function getWifWeek(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + WEEK_MS).toISOString()
  };
}

/** @param {string} currentWeek @param {Iterable<string>} completedWeeks */
export function getWifStreak(currentWeek, completedWeeks) {
  const weeks = new Set(completedWeeks);
  let weekTime = Date.parse(currentWeek);
  if (!weeks.has(currentWeek)) weekTime -= WEEK_MS;
  let streak = 0;
  while (weeks.has(new Date(weekTime).toISOString())) {
    streak += 1;
    weekTime -= WEEK_MS;
  }
  return streak;
}

/** @param {string} address @param {string} sender */
export function isWifRecipient(address, sender) {
  return /^0x[0-9a-f]{40}$/i.test(address) &&
    ![ZERO_ADDRESS, WIF_TOKEN, sender.toLowerCase()].includes(address.toLowerCase());
}

/**
 * Match the ERC-20 Transfer event's indexed sender and recipient and its
 * uint256 amount. The caller also checks the receipt sender and block.
 * @param {{address: string; topics: readonly string[]; data: string; removed?: boolean}[]} logs
 * @param {string} sender
 */
export function findWifTransfer(logs, sender) {
  if (!/^0x[0-9a-f]{40}$/i.test(sender) || sender.toLowerCase() === ZERO_ADDRESS) return null;
  const senderTopic = "0x" + sender.toLowerCase().slice(2).padStart(64, "0");
  for (const log of logs) {
    if (log.removed || log.address.toLowerCase() !== WIF_TOKEN || log.topics.length !== 3) continue;
    const [signature, from, to] = log.topics;
    if (signature.toLowerCase() !== WIF_TRANSFER_TOPIC || from.toLowerCase() !== senderTopic) continue;
    if (!/^0x0{24}[0-9a-f]{40}$/i.test(to) || !/^0x[0-9a-f]{64}$/i.test(log.data)) continue;
    const recipient = "0x" + to.toLowerCase().slice(26);
    const amount = BigInt(log.data);
    if (amount > 0n && isWifRecipient(recipient, sender)) return { recipient, amount: amount.toString() };
  }
  return null;
}
