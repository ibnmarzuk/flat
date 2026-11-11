import type { Metadata } from "next";
import { getWifWeek } from "@/lib/weekly-wif";
import WeeklyWifQuest from "./weekly-wif-quest";

export const metadata: Metadata = {
  title: "Pass WIF Forward | FlatQuest",
  description: "An optional weekly community challenge using the official $WIF token on Robinhood Chain mainnet."
};

export const dynamic = "force-dynamic";

export default function WeeklyWifPage() {
  return <WeeklyWifQuest initialWeek={getWifWeek()} />;
}
