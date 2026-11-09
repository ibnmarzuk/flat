import type { Metadata } from "next";
import "./globals.css";
import { WalletSession } from "./wallet-session";

export const metadata: Metadata = {
  title: "FlatQuest | Discover. Prove. Grow.",
  description: "A guided way to explore the World Is Flat ecosystem. Complete meaningful quests and prove your progress onchain.",
  applicationName: "FlatQuest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  openGraph: {
    title: "FlatQuest | Discover. Prove. Grow.",
    description: "Turn your first steps into verifiable progress.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WalletSession>{children}</WalletSession></body></html>;
}