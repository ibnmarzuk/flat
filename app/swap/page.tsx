import type { Metadata } from "next";
import SwapQuest from "./swap-quest";

export const metadata: Metadata = {
  title: "Swap for XP | FlatQuest",
  description: "Verify ETH and WIF swaps on Robinhood Chain and earn one XP per confirmed swap."
};

export default function SwapPage() {
  return <SwapQuest />;
}
