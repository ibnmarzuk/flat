import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Faucet Swap Demo | FlatQuest",
  description: "Use faucet Test ETH on Robinhood Chain testnet, convert it to Test WETH, and earn XP."
};

export default function WeeklyWifPage(): never {
  redirect("/swap");
}
