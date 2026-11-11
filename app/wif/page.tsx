import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Testnet Token Swaps | FlatQuest",
  description: "Use faucet Test ETH on Robinhood Chain testnet, swap it for Test LOX, and earn XP."
};

export default function WeeklyWifPage(): never {
  redirect("/swap");
}
