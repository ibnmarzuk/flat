// Robinhood faucet ETH is valueless. This demo converts it to/from test WETH
// using WETH9's deposit/withdraw methods, at exactly 1:1, without a trading pool.
// Deployment: https://docs.hood.mainnet.games/contracts.html (chain 46630).
export const TESTNET_CHAIN_ID = 46630;
export const TESTNET_CHAIN_HEX = "0xb626";
export const TESTNET_RPC = "https://rpc.testnet.chain.robinhood.com";
export const TESTNET_EXPLORER = "https://explorer.testnet.chain.robinhood.com";
export const TESTNET_FAUCET = "https://faucet.testnet.chain.robinhood.com";
export const TESTNET_WETH = "0x0dd1df4fdd55808c9d530c9599bea5107f6b9b4e";
export const TESTNET_SWAP_QUEST_SLUG = "swap-testnet";
export const TESTNET_SWAP_METHOD = "verified_testnet_wrap_unwrap";
export const DEPOSIT_SELECTOR = "0xd0e30db0";
export const WITHDRAW_SELECTOR = "0x2e1a7d4d";
export const DEPOSIT_TOPIC = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
export const WITHDRAW_TOPIC = "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";

/**
 * Accept only the wallet's direct WETH9 conversion and matching contract event.
 * Faucet transfers, approvals, ordinary transfers and mainnet trades earn no demo XP.
 * @param {{from: string, to: string | null, logs: readonly {address: string, topics: readonly string[], data: string, removed?: boolean}[]}} receipt
 * @param {{from: string, to: string | null, input: string, value: bigint}} transaction
 * @returns {{direction: "wrap" | "unwrap", amount: string} | null}
 */
export function findTestnetSwap(receipt, transaction) {
  const owner = receipt.from.toLowerCase();
  if (receipt.to?.toLowerCase() !== TESTNET_WETH || transaction.to?.toLowerCase() !== TESTNET_WETH ||
      transaction.from.toLowerCase() !== owner) return null;
  const input = transaction.input.toLowerCase();
  const wrap = (input === DEPOSIT_SELECTOR || input === "0x") && transaction.value > 0n;
  const unwrap = input.startsWith(WITHDRAW_SELECTOR) && /^0x[0-9a-f]{72}$/.test(input) && transaction.value === 0n;
  if (!wrap && !unwrap) return null;
  const amount = wrap ? transaction.value : BigInt("0x" + input.slice(10));
  if (amount <= 0n) return null;
  const event = wrap ? DEPOSIT_TOPIC : WITHDRAW_TOPIC;
  const walletTopic = "0x" + owner.slice(2).padStart(64, "0");
  const matches = receipt.logs.filter((log) => !log.removed && log.address.toLowerCase() === TESTNET_WETH &&
    log.topics.length === 2 && log.topics[0].toLowerCase() === event &&
    log.topics[1].toLowerCase() === walletTopic && /^0x[0-9a-f]{64}$/i.test(log.data) && BigInt(log.data) === amount);
  return matches.length === 1 ? { direction: wrap ? "wrap" : "unwrap", amount: amount.toString() } : null;
}
