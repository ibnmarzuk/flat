import type { Metadata } from "next";
import { getWifWeek } from "@/lib/weekly-wif";
import WeeklyWifQuest from "./weekly-wif-quest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pass WIF forward | FlatQuest",
  description: "Send WIF to another wallet, verify the transfer on Robinhood Chain, and keep a weekly streak."
};

export default function WeeklyWifPage() {
  return <WeeklyWifQuest initialWeek={getWifWeek()} />;
}
