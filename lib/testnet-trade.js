// Published Loxley deployments on Robinhood Chain testnet (46630).
// https://github.com/mattcrypto12/loxley/blob/master/docs/GRANT.md
export const TRADE_ROUTER = "0xd76e7a2a8b3c06d62b3f57622a15b9f27945cea2";
export const TRADE_FACTORY = "0x9cbde27acedd5ddd4bc7a152247beb929c1144f7";
export const TRADE_WETH = "0x1c61880f2f4ce64ead62a347ecaea39508b68544";
export const TRADE_TOKEN = "0x5355ca93a24821bc77ee6d19daf29219328afbc6";
export const TRADE_PAIR = "0xc912fd08c0c74636bdcfe3c19ebd87ed6bad6872";
export const TRADE_SYMBOL = "Test LOX";
export const TRADE_QUEST_SLUG = "swap-testnet-tokens";
export const TRADE_METHOD = "verified_testnet_amm_swap";
export const TRADE_SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
export const TRADE_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const WITHDRAW_TOPIC = "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
export const BUY_SELECTOR = "0x7ff36ab5";
export const SELL_SELECTOR = "0x18cbafe5";
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const addressWord = (address) => address.slice(2).padStart(64, "0");
const topic = (address) => "0x" + addressWord(address);

/** Build only a direct swap, with exact input, a positive minimum, and wallet recipient.
 * @param {{direction: "buy" | "sell", amount: bigint, minimum: bigint, wallet: string, deadline: bigint}} input
 */
export function buildTradeData({ direction, amount, minimum, wallet, deadline }) {
  if (!/^0x[0-9a-f]{40}$/i.test(wallet) || !["buy", "sell"].includes(direction) || amount <= 0n || minimum <= 0n || deadline <= 0n) throw new Error("Invalid swap parameters.");
  const owner = wallet.toLowerCase();
  const head = direction === "buy" ? [word(minimum), word(128), addressWord(owner), word(deadline)]
    : [word(amount), word(minimum), word(160), addressWord(owner), word(deadline)];
  const path = direction === "buy" ? [TRADE_WETH, TRADE_TOKEN] : [TRADE_TOKEN, TRADE_WETH];
  return (direction === "buy" ? BUY_SELECTOR : SELL_SELECTOR) + [...head, word(2), ...path.map(addressWord)].join("");
}

/** Verify direct AMM calldata, trusted pair's Swap, and both token settlements.
 * @param {{from: string, to: string | null, logs: readonly {address: string, topics: readonly string[], data: string, removed?: boolean}[]}} receipt
 * @param {{from: string, to: string | null, input: string, value: bigint}} transaction
 * @returns {{direction: "buy" | "sell", amount: string, ethAmount: string} | null}
 */
export function findTestnetTrade(receipt, transaction) {
  const owner = receipt.from.toLowerCase();
  if (receipt.to?.toLowerCase() !== TRADE_ROUTER || transaction.to?.toLowerCase() !== TRADE_ROUTER || transaction.from.toLowerCase() !== owner) return null;
  const input = transaction.input.toLowerCase();
  const buy = input.startsWith(BUY_SELECTOR);
  if ((!buy && !input.startsWith(SELL_SELECTOR)) || !/^0x[0-9a-f]+$/.test(input) || input.length !== (buy ? 458 : 522)) return null;
  const words = input.slice(10).match(/.{64}/g);
  if (!words) return null;
  const minimum = BigInt("0x" + words[buy ? 0 : 1]);
  const amountIn = buy ? transaction.value : BigInt("0x" + words[0]);
  if (amountIn <= 0n || minimum <= 0n || (!buy && transaction.value !== 0n)) return null;
  const deadline = BigInt("0x" + words[buy ? 3 : 4]);
  if (deadline <= 0n || buildTradeData({ direction: buy ? "buy" : "sell", amount: amountIn, minimum, wallet: owner, deadline }) !== input) return null;
  const logs = receipt.logs.filter((log) => !log.removed);
  const swaps = logs.filter((log) => log.address.toLowerCase() === TRADE_PAIR && log.topics.length === 3 &&
    log.topics[0].toLowerCase() === TRADE_SWAP_TOPIC && log.topics[1].toLowerCase() === topic(TRADE_ROUTER) &&
    log.topics[2].toLowerCase() === topic(buy ? owner : TRADE_ROUTER) && /^0x[0-9a-f]{256}$/i.test(log.data));
  if (swaps.length !== 1) return null;
  const amounts = swaps[0].data.slice(2).match(/.{64}/g)?.map((value) => BigInt("0x" + value));
  if (!amounts) return null;
  const [ethIn, tokenIn, ethOut, tokenOut] = amounts;
  if (buy ? ethIn !== amountIn || tokenIn !== 0n || ethOut !== 0n || tokenOut < minimum
    : tokenIn !== amountIn || ethIn !== 0n || tokenOut !== 0n || ethOut < minimum) return null;
  const ethAmount = buy ? ethIn : ethOut;
  const amount = buy ? tokenOut : tokenIn;
  const hasTransfer = (contract, from, to, value) => logs.some((log) =>
    log.address.toLowerCase() === contract && log.topics.length === 3 && log.topics[0].toLowerCase() === TRADE_TRANSFER_TOPIC &&
    log.topics[1].toLowerCase() === topic(from) && log.topics[2].toLowerCase() === topic(to) &&
    /^0x[0-9a-f]{64}$/i.test(log.data) && BigInt(log.data) === value);
  if (!hasTransfer(TRADE_TOKEN, buy ? TRADE_PAIR : owner, buy ? owner : TRADE_PAIR, amount) ||
      !hasTransfer(TRADE_WETH, buy ? TRADE_ROUTER : TRADE_PAIR, buy ? TRADE_PAIR : TRADE_ROUTER, ethAmount)) return null;
  if (!buy && !logs.some((log) => log.address.toLowerCase() === TRADE_WETH && log.topics.length === 2 &&
    log.topics[0].toLowerCase() === WITHDRAW_TOPIC && log.topics[1].toLowerCase() === topic(TRADE_ROUTER) &&
    /^0x[0-9a-f]{64}$/i.test(log.data) && BigInt(log.data) === ethAmount)) return null;
  return { direction: buy ? "buy" : "sell", amount: amount.toString(), ethAmount: ethAmount.toString() };
}
