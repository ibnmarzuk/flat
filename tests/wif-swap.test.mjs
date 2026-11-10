import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { WIF_TOKEN, WIF_TRANSFER_TOPIC } from "../lib/weekly-wif.js";
import { findWifSwap } from "../lib/wif-swap.js";

const manager = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const router = "0x8876789976decbfcbbbe364623c63652db8c0904";
const router212 = "0x204faca1764b154221e35c0d20abb3c525710498";
const hook = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044";
const buyWallet = "0x6f8de009cd4fad0ab69dd519b60099e8ad2a1ee2";
const sellWallet = "0x703aa657f283aae8cc334ae527cbd61dd6e9a684";
const pool = "0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79";
const swapTopic = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const swapData = parseAbiParameters("int128, int128, uint160, uint128, int24, uint24");
const topicAddress = (address) => "0x" + address.slice(2).padStart(64, "0");

function transfer(from, to, amount) {
  return {
    address: WIF_TOKEN,
    topics: [WIF_TRANSFER_TOPIC, topicAddress(from), topicAddress(to)],
    data: "0x" + amount.toString(16).padStart(64, "0")
  };
}

function swap(amount0, amount1, caller = router) {
  return {
    address: manager,
    topics: [swapTopic, pool, topicAddress(caller)],
    data: encodeAbiParameters(swapData, [
      amount0, amount1, 98183637799192557305057798548163n, 29277002188455995403037n, 142452, 0
    ])
  };
}

// The WIF buy settled slightly less than the swap amount because the Pons hook took a fee.
// Public receipt: 0x1daedf33ed1d6fb72072c90f227444dc71114686a47fb12c4881bbd15c30043e.
const buyAmount = 338033943049301668004834n;
const buy = {
  from: buyWallet,
  to: router,
  logs: [
    swap(-220261190916296978n, 341448427322526937378620n),
    transfer(manager, hook, 3414484273225269373786n),
    transfer(manager, buyWallet, buyAmount)
  ]
};

// Public receipt: 0x2e96cc07c7884639207845cd7282891dced0f27990b2d24a10a7252415eada49.
const sellAmount = 434189224197507661301643n;
const sell = {
  from: sellWallet,
  to: router,
  logs: [swap(275896142852527812n, -sellAmount), transfer(sellWallet, manager, sellAmount)]
};

test("credits a WIF buy using the amount settled to the wallet after hook fees", () => {
  assert.deepEqual(findWifSwap(buy), { direction: "buy", wifAmount: buyAmount.toString() });
});

test("credits a WIF sell and accepts the published Universal Router 2.1.2", () => {
  assert.deepEqual(findWifSwap(sell), { direction: "sell", wifAmount: sellAmount.toString() });
  const updatedRouter = { ...sell, to: router212, logs: [
    swap(275896142852527812n, -sellAmount, router212), sell.logs[1]
  ] };
  assert.deepEqual(findWifSwap(updatedRouter), { direction: "sell", wifAmount: sellAmount.toString() });
});

test("rejects a plain token transfer, a different token or a different wallet", () => {
  assert.equal(findWifSwap({ ...sell, logs: [sell.logs[1]] }), null);
  assert.equal(findWifSwap({ ...sell, logs: [sell.logs[0], { ...sell.logs[1], address: hook }] }), null);
  assert.equal(findWifSwap({ ...buy, from: sellWallet }), null);
});

test("rejects other pools, untrusted routers and counterfeit swap events", () => {
  const [event, settlement] = sell.logs;
  assert.equal(findWifSwap({ ...sell, to: hook }), null);
  assert.equal(findWifSwap({ ...sell, logs: [{ ...event, address: hook }, settlement] }), null);
  assert.equal(findWifSwap({ ...sell, logs: [
    { ...event, topics: [swapTopic, "0x" + "0".repeat(64), topicAddress(router)] }, settlement
  ] }), null);
  assert.equal(findWifSwap({ ...sell, logs: [swap(1n, -1n, hook), settlement] }), null);
});

test("requires a real, nonzero swap and settlement in the same direction", () => {
  assert.equal(findWifSwap({ ...sell, logs: [swap(1n, 1n), sell.logs[1]] }), null);
  assert.equal(findWifSwap({ ...sell, logs: [sell.logs[0], transfer(manager, sellWallet, sellAmount)] }), null);
  assert.equal(findWifSwap({ ...sell, logs: [sell.logs[0], transfer(sellWallet, manager, 0n)] }), null);
  assert.equal(findWifSwap({ ...sell, logs: [{ ...sell.logs[0], removed: true }, sell.logs[1]] }), null);
});
