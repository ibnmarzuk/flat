import type { Metadata } from "next";
import SwapQuest from "./swap-quest";

export const metadata: Metadata = {
  title: "Testnet Token Swaps | FlatQuest",
  description: "Swap faucet Test ETH and Test LOX on Robinhood Chain testnet, copy your transaction hash, and earn XP."
};

export default function SwapPage() {
  return <SwapQuest />;
}
