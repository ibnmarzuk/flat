import type { Metadata } from "next";
import SendQuest from "./send-quest";

export const metadata: Metadata = {
  title: "Testnet Token Send | FlatQuest",
  description: "Send Test LOX on Robinhood Chain testnet, verify the onchain receipt, and earn XP."
};

export default function SendPage() { return <SendQuest />; }
