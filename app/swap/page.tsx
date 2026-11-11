import type { Metadata } from "next";
import SwapQuest from "./swap-quest";

export const metadata: Metadata = {
  title: "Faucet Swap Demo | FlatQuest",
  description: "Convert faucet Test ETH and Test WETH on Robinhood Chain testnet, copy your transaction hash, and earn XP."
};

export default function SwapPage() {
  return <SwapQuest />;
}
