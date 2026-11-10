"use client";

import Link from "next/link";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useWalletSession } from "./wallet-session";
import { selectWalletNetwork } from "@/lib/wallet-network";

const CHAIN_ID = "0xb626"; // Robinhood Chain testnet, 46630
const RPC = "https://rpc.testnet.chain.robinhood.com";
type Quest = { id: number; slug: string; category: string; title: string; description: string; reward: string; type: string };
const initialQuests: Quest[] = [
  { id: 1, slug: "connect-wallet", category: "Getting started", title: "Connect your wallet", description: "Bring your onchain identity into the journey. Your wallet stays in your control.", reward: "First step", type: "wallet" },
  { id: 2, slug: "robinhood-testnet", category: "Getting started", title: "Find your place on Robinhood Chain", description: "Switch to the Robinhood Chain testnet and get familiar with the network.", reward: "Network ready", type: "network" },
  { id: 3, slug: "prove-transaction", category: "Onchain proof", title: "Prove an onchain transaction", description: "Submit a transaction hash. FlatQuest checks the public receipt, submitted sender address and confirmations against the testnet.", reward: "Verified proof", type: "transaction" },
  { id: 4, slug: "explore-ecosystem", category: "Explore", title: "Explore the ecosystem", description: "Discover a project or useful resource in the World Is Flat ecosystem. Record what you explored.", reward: "Explorer", type: "explore" }
];

function Mark({ small = false }: { small?: boolean }) {
  return <span className={small ? "brand-mark small" : "brand-mark"} aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M14 43.5C19.2 43.5 20.3 32 29 32C36.2 32 36.4 20.5 49 20.5" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round"/><circle cx="14" cy="43.5" r="5" fill="currentColor"/><circle cx="29" cy="32" r="5" fill="currentColor" stroke="#C7F36B" strokeWidth="2"/><path d="m42 20.5 5.2 5.2 8.3-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

export default function Home() {
  const {
    account, wallet, chainId, checkingSession, connecting, retrySeconds,
    connect, setNotice, getWalletProvider, setChainId, isCurrentWallet, expireSession
  } = useWalletSession();
  const [switching, setSwitching] = useState(false);
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const [progress, setProgress] = useState<{ wallet: string; slugs: string[] }>({ wallet: "", slugs: [] });
  const [filter, setFilter] = useState("All quests");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState<"transaction" | "explore" | null>(null);
  const [proof, setProof] = useState<{
    transactionHash: string;
    walletAddress: string;
    blockNumber: number;
    transactionTo: string | null;
    inputDataBytes: number;
    confirmations: number;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/quests", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { quests?: Quest[] }) => {
        if (!controller.signal.aborted && Array.isArray(data.quests) && data.quests.length) setQuests(data.quests);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setProgress({ wallet, slugs: [] });
    setProof(null);
    if (!wallet) { setHash(""); return; }
    const controller = new AbortController();
    fetch("/api/progress", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 && !controller.signal.aborted) expireSession(wallet);
        if (!response.ok) return;
        const data = await response.json() as {
          walletAddress: string;
          completions: { slug: string; status: string }[];
        };
        if (controller.signal.aborted || !isCurrentWallet(wallet) || data.walletAddress?.toLowerCase() !== wallet) return;
        const slugs = data.completions
          .filter((item) => item.status === "verified" || item.status === "submitted")
          .map((item) => item.slug);
        setProgress((current) => ({
          wallet,
          slugs: [...new Set([...(current.wallet === wallet ? current.slugs : []), ...slugs])]
        }));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [wallet, expireSession, isCurrentWallet]);

  const completed = wallet && progress.wallet === wallet ? progress.slugs : [];
  const completedCount = quests.filter((quest) => completed.includes(quest.slug)).length;
  const percentComplete = Math.round((completedCount / quests.length) * 100);
  const verificationEvidence = proof?.walletAddress === wallet ? proof : null;
  const filtered = useMemo(() => quests.filter((q) => filter === "All quests" || q.category === filter), [filter, quests]);
  const onTestnet = chainId.toLowerCase() === CHAIN_ID;

  function save(slug: string) {
    if (!isCurrentWallet(wallet)) return;
    setProgress((current) => ({
      wallet,
      slugs: [...new Set([...(current.wallet === wallet ? current.slugs : []), slug])]
    }));
  }

  async function switchNetwork() {
    if (switching || checkingSession) return;
    setSwitching(true);
    try {
      const provider = await getWalletProvider();
      if (!provider) { setNotice("Open FlatQuest in a browser with MetaMask or another Ethereum wallet."); return; }
      const id = await selectWalletNetwork(provider, {
        chainId: CHAIN_ID,
        chainName: "Robinhood Chain Testnet",
        rpcUrl: RPC,
        explorer: "https://explorer.testnet.chain.robinhood.com/"
      });
      setChainId(id);
      if (id !== CHAIN_ID) throw new Error("Select Robinhood Chain testnet in your wallet and try again.");
      if (!isCurrentWallet(wallet)) {
        setNotice("Robinhood Chain testnet selected. Verify your wallet to record the milestone.");
        return;
      }
      if (completed.includes("robinhood-testnet")) {
        setNotice("Your testnet setup is already recorded.");
        return;
      }
      const response = await fetch("/api/verify-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: id })
      });
      const result = await response.json() as { verified?: boolean; walletAddress?: string; error?: string };
      if (!isCurrentWallet(wallet)) return;
      if (response.status === 401) expireSession(wallet);
      if (!response.ok || !result.verified || result.walletAddress?.toLowerCase() !== wallet) {
        throw new Error(result.error || "Could not record the testnet setup.");
      }
      save("robinhood-testnet");
      setNotice("Robinhood Chain testnet setup recorded.");
    } catch (error) {
      const code = (error as { code?: number } | null)?.code;
      if (code === 4001) setNotice("The network switch was declined. Try again when you are ready.");
      else if (code === -32002) setNotice("Open your wallet to complete the pending network request.");
      else setNotice(error instanceof Error ? error.message : "Network switch failed. Try again.");
    } finally {
      setSwitching(false);
    }
  }

  async function recordExploration() {
    if (busy || completed.includes("explore-ecosystem")) return;
    if (!isCurrentWallet(wallet)) { setNotice("Verify your wallet to save your explorer milestone."); return; }
    setBusy("explore");
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questSlug: "explore-ecosystem", status: "submitted" })
      });
      if (!isCurrentWallet(wallet)) return;
      if (response.status === 401) {
        expireSession(wallet);
        throw new Error("Verify your wallet again to save your explorer milestone.");
      }
      if (!response.ok) throw new Error("Could not save your explorer milestone. Try again.");
      save("explore-ecosystem");
      setNotice("Explorer milestone saved as self-reported activity.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save progress.");
    } finally {
      setBusy(null);
    }
  }

  async function verifyTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isCurrentWallet(wallet)) { setNotice("Verify your wallet before submitting proof."); return; }
    if (!onTestnet) { setNotice("Switch to Robinhood Chain testnet before verifying."); return; }
    const transactionHash = hash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) { setNotice("Enter a valid 32-byte transaction hash."); return; }
    setBusy("transaction");
    setNotice("");
    try {
      const response = await fetch("/api/verify-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questId: "prove-transaction", transactionHash, walletAddress: wallet })
      });
      const result = await response.json() as NonNullable<typeof proof> & { verified?: boolean; error?: string };
      if (!isCurrentWallet(wallet)) return;
      if (response.status === 401) expireSession(wallet);
      if (!response.ok || !result.verified || result.walletAddress?.toLowerCase() !== wallet) {
        throw new Error(result.error || "Verification failed. Try again.");
      }
      setProof({ ...result, walletAddress: wallet });
      save("prove-transaction");
      setNotice("Transaction verified. Your receipt is saved to this wallet’s progress.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verification failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return <main>
    <nav className="nav shell">
      <a className="wordmark" href="#"><Mark/><span>flat<span className="wordmark-light">quest</span></span></a>
      <div className="nav-links"><a href="#how-it-works">How it works</a><a href="#quests">Quests</a><a href="#about">Why FlatQuest</a><Link href="/dashboard" prefetch={false}>My dashboard ↗</Link></div>
      <button className="connect-button" onClick={connect} disabled={checkingSession || connecting || retrySeconds > 0} aria-busy={checkingSession || connecting}>{checkingSession ? "Checking wallet…" : retrySeconds > 0 ? `Retry in ${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}` : connecting ? "Connecting..." : account ? (wallet ? account.slice(0, 6) + "..." + account.slice(-4) : "Verify wallet") : "Connect wallet"} <span>{connecting ? "…" : "↗"}</span></button>
    </nav>

    <nav className="mobile-navigation shell" aria-label="Quick navigation"><a href="#quests">Quests</a><Link href="/dashboard" prefetch={false}>My dashboard ↗</Link></nav>
    <section className="hero shell">
      <div className="hero-copy">
        <div className="eyebrow"><span className="live-dot"/> YOUR ONCHAIN JOURNEY STARTS HERE</div>
        <h1>Make your first<br/>move <em>count.</em></h1>
        <p className="hero-lede">A clearer way into the World Is Flat ecosystem. Discover useful quests, take meaningful action, and prove every milestone.</p>
        <div className="hero-actions"><a className="primary-button" href="#quests">Explore quests <span>↗</span></a><a className="text-link" href="#how-it-works">See how it works <span>↓</span></a></div>
        <div className="hero-proof"><div className="avatar-stack"><span>F</span><span>Q</span><span>↗</span></div><span>Small steps. Verifiable progress.</span></div>
      </div>
      <div className="hero-art" aria-label="Illustration of a guided journey with three verified milestones">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="art-label label-top">YOUR JOURNEY <span>01 / 04</span></div>
        <div className="route-line"><span className="route-node node-one">01</span><span className="route-node node-two">02</span><span className="route-node node-three"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span></div>
        <div className="art-card"><div className="art-card-icon"><Mark small/></div><div><strong>Progress, with proof.</strong><span>Every milestone moves you forward.</span></div><div className="art-check">✓</div></div>
        <div className="art-foot"><span>DISCOVER</span><span>PROVE</span><span>GROW</span></div>
        <div className="floating-tag">ONCHAIN VERIFIED <span>↗</span></div>
      </div>
      <div className="hero-bottom"><span>BUILT FOR THE NEXT WAVE</span><span>WORLD IS FLAT · ROBINHOOD CHAIN</span></div>
    </section>

    <aside className="weekly-wif-entry shell" aria-label="Weekly WIF quest">
      <div><span className="eyebrow">NEW EVERY MONDAY · ROBINHOOD CHAIN</span><h2>Pass $WIF forward.</h2>
        <p>Welcome another wallet, verify your transfer, and build a weekly streak.</p></div>
      <Link href="/wif" className="primary-button">Open weekly quest <span>↗</span></Link>
    </aside>

    <aside className="weekly-wif-entry shell" aria-label="Swap XP quest">
      <div><span className="eyebrow">REPEATABLE QUEST · ROBINHOOD CHAIN</span><h2>Swap for XP.</h2>
        <p>Verify an ETH ↔ $WIF swap to earn XP and move up the leaderboard.</p></div>
      <Link href="/swap" className="primary-button">Open swap quest <span>↗</span></Link>
    </aside>

    <section className="stats shell"><div><strong>01</strong><span>Discover your next step</span></div><div><strong>02</strong><span>Complete a useful action</span></div><div><strong>03</strong><span>Keep proof of your progress</span></div></section>

    <section className="section shell" id="how-it-works">
      <div className="section-heading"><div><div className="eyebrow">A BETTER WAY TO GET STARTED</div><h2>Less guessing.<br/><em>More doing.</em></h2></div><p>Web3 can feel like a maze when you are new. FlatQuest turns the first steps into a guided path, so you always know what to do and why it matters.</p></div>
      <div className="steps-grid"><article><span className="step-number">01 / DISCOVER</span><div className="step-icon">⌕</div><h3>Find your next move</h3><p>Explore clear, beginner-friendly quests with a purpose, not a wall of confusing tasks.</p></article><article><span className="step-number">02 / PROVE</span><div className="step-icon">⌁</div><h3>Show what you did</h3><p>Onchain actions are checked against network evidence. A claim is never treated as proof.</p></article><article><span className="step-number">03 / GROW</span><div className="step-icon">↗</div><h3>Build real momentum</h3><p>See your milestones, understand what comes next, and keep moving through the ecosystem.</p></article></div>
    </section>

    <section className="quest-section" id="quests"><div className="shell quest-layout">
      <div className="quest-intro"><div className="eyebrow">YOUR NEXT STEP IS WAITING</div><h2>Start small.<br/><em>Go further.</em></h2><p>Choose a quest and build your understanding one meaningful action at a time.</p>
        <div className="progress-card"><div className="progress-top"><span>YOUR PROGRESS</span><strong>{percentComplete}%</strong></div><div className="progress-track"><span style={{ width: percentComplete + "%" }}/></div><div className="progress-caption">{completedCount} of {quests.length} milestones recorded</div><div className="progress-steps">{quests.map((q) => <span key={q.slug} className={completed.includes(q.slug) ? "progress-step done" : "progress-step"}/>)}</div></div>
      </div>
      <div className="quest-list">
        <div className="quest-toolbar"><div><span className="eyebrow">THE QUEST BOARD</span><h3>Pick your path</h3></div><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter quests"><option>All quests</option><option>Getting started</option><option>Onchain proof</option><option>Explore</option></select></div>
        {filtered.map((q) => <article className="quest-card" id={`quest-${q.slug}`} key={q.slug}><div className="quest-card-top"><span className="quest-index">0{q.id}</span><span className="quest-category">{q.category}</span><span className={completed.includes(q.slug) ? "status complete" : "status"}>{completed.includes(q.slug) ? q.type === "transaction" ? "✓ Onchain verified" : q.type === "explore" ? "✓ Self-reported" : q.type === "wallet" ? "✓ Wallet verified" : q.type === "network" ? "✓ Network ready" : "✓ Recorded" : "○ Available"}</span></div><h4>{q.title}</h4><p>{q.description}</p><Link className="quest-guide-link" href={`/quests/${q.slug}`}>Read quest guide ↗</Link>
          {q.type === "transaction" && <form className="verify-field" onSubmit={verifyTransaction}>
            <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paste transaction hash (0x…)" aria-label="Transaction hash" spellCheck={false} autoComplete="off" />
            <button type="submit" disabled={checkingSession || !!busy}>{busy === "transaction" ? "Checking…" : "Verify proof"}</button>
          </form>}
          {q.type === "transaction" && completed.includes(q.slug) && <Link className="quest-guide-link" href="/dashboard" prefetch={false}>View saved proof ↗</Link>}
          {q.type === "explore" && <div className="explore-action"><button onClick={recordExploration} disabled={checkingSession || !!busy || completed.includes(q.slug)}>{completed.includes(q.slug) ? "Explored ✓" : busy === "explore" ? "Saving…" : "I explored the ecosystem"}</button><a href="https://worldisflat.fun/" target="_blank" rel="noreferrer">Open World Is Flat ↗</a></div>}
          {q.type === "wallet" && <button className="quest-action" onClick={connect} disabled={checkingSession || connecting || retrySeconds > 0}>{retrySeconds > 0 ? `Try again in ${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}` : connecting ? "Connecting..." : wallet ? "Wallet verified ✓" : account ? "Verify wallet ↗" : "Connect wallet ↗"}</button>}
          {q.type === "network" && <button className="quest-action" onClick={switchNetwork} disabled={checkingSession || switching}>{switching ? "Checking network…" : onTestnet ? completed.includes(q.slug) ? "Network ready ✓" : "Record testnet setup ↗" : "Switch to testnet ↗"}</button>}
        </article>)}
        {verificationEvidence && <section className="evidence-card" aria-label="Transaction verification evidence"><div className="evidence-heading"><span className="evidence-badge">✓</span><div><strong>Transaction receipt verified</strong><small>ROBINHOOD CHAIN TESTNET · 46630</small></div></div><div className="evidence-grid"><div><small>TRANSACTION</small><a href={"https://explorer.testnet.chain.robinhood.com/tx/" + verificationEvidence.transactionHash} target="_blank" rel="noreferrer">{verificationEvidence.transactionHash.slice(0, 10)}…{verificationEvidence.transactionHash.slice(-8)} ↗</a></div><div><small>BLOCK</small><strong>{verificationEvidence.blockNumber.toLocaleString()}</strong></div><div><small>CONFIRMATIONS</small><strong>{verificationEvidence.confirmations}</strong></div><div><small>WALLET</small><strong>{verificationEvidence.walletAddress.slice(0, 8)}…{verificationEvidence.walletAddress.slice(-6)}</strong></div><div><small>RECIPIENT</small><strong>{verificationEvidence.transactionTo ? verificationEvidence.transactionTo.slice(0, 8) + "…" + verificationEvidence.transactionTo.slice(-6) : "Contract creation"}</strong></div><div><small>INPUT DATA</small><strong>{verificationEvidence.inputDataBytes} bytes</strong></div></div><p>Receipt evidence is saved to your FlatQuest account. This check confirms a successful transaction from your authenticated wallet. It does not prove a specific contract interaction or a particular ecosystem task.</p></section>}

        <div className="demo-note">Verify your wallet to save milestones to your account. Transaction proof is checked on Robinhood Chain testnet. Explorer activity is self-reported.</div>
      </div>
    </div></section>

    <section className="closing shell" id="about"><div className="closing-mark"><Mark/></div><div><div className="eyebrow">THE POINT IS PROGRESS</div><h2>Every journey needs<br/>a <em>first proof.</em></h2></div><a className="primary-button" href="#quests">Take your first step <span>↗</span></a></section>
    <footer className="footer shell"><a className="wordmark" href="#"><Mark small/><span>flat<span className="wordmark-light">quest</span></span></a><span>Discover. Prove. Grow.</span><span>Built for the World Is Flat ecosystem.</span></footer>
  </main>;
}