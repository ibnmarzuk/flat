import Link from "next/link";
import { notFound } from "next/navigation";

const guides = {
  "connect-wallet": {
    number: "01",
    title: "Connect your wallet",
    category: "Getting started",
    description: "Bring your onchain identity into the journey. Your wallet stays in your control.",
    purpose: "A wallet is your personal interface for interacting with EVM networks. Connecting lets FlatQuest read your public address. It does not give the app permission to move your assets.",
    steps: [
      ["Choose a wallet", "Install and open a browser wallet you trust, such as MetaMask. Create or import a wallet only through its official app or website."],
      ["Keep your recovery phrase private", "Never share your recovery phrase or private key. FlatQuest will never ask for either one."],
      ["Connect to FlatQuest", "Return to FlatQuest and select Connect wallet. Review the connection request in your wallet and approve only if the site shown is the one you intended to visit."]
    ],
    resource: "https://ethereum.org/en/wallets/"
  },
  "robinhood-testnet": {
    number: "02",
    title: "Find your place on Robinhood Chain",
    category: "Getting started",
    description: "Switch to Robinhood Chain testnet and get familiar with the network.",
    purpose: "The testnet is a safe environment for learning and trying supported applications without using mainnet assets. FlatQuest currently checks for chain ID 46630.",
    steps: [
      ["Review the network details", "Robinhood Chain testnet uses chain ID 46630 and ETH as its native gas token. Testnet assets are not mainnet funds."],
      ["Switch networks", "Use the Switch to testnet action on the quest board. Your wallet will ask you to approve adding or switching to the network."],
      ["Confirm the active network", "Check that your wallet shows Robinhood Chain testnet. FlatQuest detects the active chain and records the milestone locally in this prototype."]
    ],
    resource: "https://docs.robinhood.com/chain/connecting/"
  },
  "prove-transaction": {
    number: "03",
    title: "Prove an onchain transaction",
    category: "Onchain proof",
    description: "Submit a transaction hash and let FlatQuest check its receipt, sender and confirmations.",
    purpose: "A transaction hash is a public reference to an onchain operation. FlatQuest checks network evidence instead of trusting a screenshot or a self reported claim.",
    steps: [
      ["Complete a testnet transaction", "Use a trusted testnet application or faucet. Check the destination and transaction details in your wallet before signing."],
      ["Wait for confirmation", "The transaction must succeed and be included in a block. This prototype requires at least two confirmations."],
      ["Submit the transaction hash", "Paste the 32 byte transaction hash into the quest card. The prototype checks the receipt status, transaction sender against the submitted wallet address, and confirmation count against Robinhood Chain testnet. This does not prove wallet ownership or a specific app interaction."]
    ],
    resource: "https://explorer.testnet.chain.robinhood.com/"
  },
  "explore-ecosystem": {
    number: "04",
    title: "Explore the ecosystem",
    category: "Explore",
    description: "Discover a useful project or resource in the World Is Flat ecosystem.",
    purpose: "Good onboarding is about understanding what exists and why it matters, not rushing through clicks. This is a learning milestone, not an onchain verification.",
    steps: [
      ["Visit World Is Flat", "Read the official overview and understand the ecosystem's stated mission."],
      ["Find something useful", "Identify a project, tool, community resource or product that is relevant to your interests."],
      ["Reflect on what you learned", "Return to FlatQuest and record the milestone. In this prototype, this action is self reported and stored only in this browser."]
    ],
    resource: "https://worldisflat.fun/"
  }
} as const;

export function generateStaticParams() {
  return Object.keys(guides).map((slug) => ({ slug }));
}

export default async function QuestGuide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guides[slug as keyof typeof guides];
  if (!guide) notFound();

  return (
    <main className="guide-page">
      <div className="guide-shell">
        <Link href="/#quests" className="guide-back">← Back to quest board</Link>
        <div className="guide-kicker">FLATQUEST FIELD GUIDE · QUEST {guide.number}</div>
        <div className="guide-heading">
          <span className="guide-category">{guide.category}</span>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
        </div>
        <section className="guide-purpose">
          <span>WHY THIS MATTERS</span>
          <p>{guide.purpose}</p>
        </section>
        <section className="guide-steps">
          <div className="guide-section-label">YOUR CHECKLIST</div>
          {guide.steps.map(([title, description], index) => (
            <article className="guide-step" key={title}>
              <span className="guide-step-number">0{index + 1}</span>
              <div><h2>{title}</h2><p>{description}</p></div>
            </article>
          ))}
        </section>
        <a className="guide-resource" href={guide.resource} target="_blank" rel="noreferrer">
          <span><small>OFFICIAL RESOURCE</small><strong>Open reference material</strong></span><span aria-hidden="true">↗</span>
        </a>
        <div className="guide-disclaimer">FlatQuest will clearly distinguish local prototype progress, self reported learning and independently verifiable onchain evidence. Never share your private key or recovery phrase.</div>
        <Link href="/#quests" className="primary-button guide-cta">Return to quests <span>↗</span></Link>
      </div>
    </main>
  );
}
