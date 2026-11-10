import { WIF_TOKEN, WIF_TRANSFER_TOPIC } from "./weekly-wif.js";

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const ROUTERS = new Set([
  "0x8876789976decbfcbbbe364623c63652db8c0904",
  "0x204faca1764b154221e35c0d20abb3c525710498"
]);

// Graduated Pons ETH/WIF pool on Robinhood Chain, with native ETH as currency0.
const POOL_ID = "0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

function addressTopic(address) {
  return "0x" + address.slice(2).padStart(64, "0");
}

/**
 * Verify the pool swap and the wallet's WIF settlement. The amount in the
 * Swap event can differ from the settled amount because of the Pons hook.
 * @param {{ from: string, to: string | null, logs: readonly { address: string, topics: readonly string[], data: string, removed?: boolean }[] }} receipt
 * @returns {{ direction: "buy" | "sell", wifAmount: string } | null}
 */
export function findWifSwap(receipt) {
  const router = receipt.to?.toLowerCase();
  if (!router || !ROUTERS.has(router)) return null;

  const sender = receipt.from.toLowerCase();
  const walletTopic = addressTopic(sender);
  const poolTopic = addressTopic(POOL_MANAGER);
  const routerTopic = addressTopic(router);
  let swapped = 0n;
  let settled = 0n;

  for (const log of receipt.logs) {
    if (log.removed || log.topics.length !== 3) continue;
    const contract = log.address.toLowerCase();
    const [event, first, second] = log.topics.map((topic) => topic.toLowerCase());

    if (contract === POOL_MANAGER && event === SWAP_TOPIC && first === POOL_ID &&
        second === routerTopic && /^0x[0-9a-f]{384}$/i.test(log.data)) {
      // The first two ABI words are sign-extended int128 deltas.
      const ethDelta = BigInt.asIntN(256, BigInt(log.data.slice(0, 66)));
      const wifDelta = BigInt.asIntN(256, BigInt("0x" + log.data.slice(66, 130)));
      if (BigInt.asIntN(128, ethDelta) !== ethDelta || BigInt.asIntN(128, wifDelta) !== wifDelta) continue;
      if ((ethDelta < 0n && wifDelta > 0n) || (ethDelta > 0n && wifDelta < 0n)) swapped += wifDelta;
    }

    if (contract === WIF_TOKEN && event === WIF_TRANSFER_TOPIC && /^0x[0-9a-f]{64}$/i.test(log.data)) {
      if (first === poolTopic && second === walletTopic) settled += BigInt(log.data);
      if (first === walletTopic && second === poolTopic) settled -= BigInt(log.data);
    }
  }

  if (swapped > 0n && settled > 0n) return { direction: "buy", wifAmount: settled.toString() };
  if (swapped < 0n && settled < 0n) return { direction: "sell", wifAmount: (-settled).toString() };
  return null;
}
