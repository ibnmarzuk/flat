import type { Metadata } from "next";
import Link from "next/link";
import ExampleReceipt from "./example-receipt";
import styles from "../weekly.module.css";

export const metadata: Metadata = {
  title: "Check a public WIF receipt | FlatQuest",
  description: "See how FlatQuest checks a real WIF transfer on Robinhood Chain mainnet."
};

export default function WifExamplePage() {
  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Example navigation">
        <Link href="/wif">← Weekly quest</Link>
        <Link href="/dashboard">My dashboard ↗</Link>
      </nav>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>PUBLIC EXAMPLE · READ-ONLY</span>
          <h1>Follow the <em>proof.</em></h1>
          <p>Check a real $WIF receipt on Robinhood Chain mainnet. See what FlatQuest looks for before a wallet can earn its weekly milestone.</p>
        </div>
        <aside className={styles.week}>
          <span className={styles.kicker}>PASS $WIF FORWARD</span>
          <h2>From receipt to milestone</h2>
          <p>The weekly quest also checks your signed-in wallet and the challenge dates before saving progress.</p>
        </aside>
      </header>
      <ExampleReceipt />
    </div>
  </main>;
}
