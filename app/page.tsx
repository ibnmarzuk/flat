"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

type WalletProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, cb: (...args: unknown[]) => void) => void; removeListener?: (event: string, cb: (...args: unknown[]) => void) => void; isMetaMask?: boolean };
declare global {
  interface Window { ethereum?: WalletProvider & { providers?: WalletProvider[] } }
}

async function discoverWalletProvider(): Promise<WalletProvider | null> {
  if (typeof window === "undefined") return null;
  if (window.ethereum) return window.ethereum.providers?.find((item) => item.isMetaMask) || window.ethereum;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (provider: WalletProvider | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(provider);
    };
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: WalletProvider }>).detail;
      if (detail?.provider) finish(detail.provider);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => finish(window.ethereum || null), 800);
  });
}

const CHAIN_ID = "0xB626"; // Robinhood Chain testnet, 46630
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
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const [account, setAccount] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [chainId, setChainId] = useState("");
  const [completed, setCompleted] = useState<number[]>([]);
  const [filter, setFilter] = useState("All quests");
  const [hash, setHash] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [authRetryAt, setAuthRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [walletProvider, setWalletProvider] = useState<WalletProvider | null>(null);
  const [explored, setExplored] = useState(false);
  const [verificationEvidence, setVerificationEvidence] = useState<{ transactionHash: string; walletAddress: string; blockNumber: number; blockHash: string; transactionTo: string | null; transactionValue: string; inputDataBytes: number; confirmations: number; verifiedAt: string } | null>(null);

  useEffect(() => {
    if (!authRetryAt) { setRetrySeconds(0); return; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((authRetryAt - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (remaining === 0) setAuthRetryAt(0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [authRetryAt]);

  const loadPersistentProgress = useCallback(async () => {
    try {
      const response = await fetch("/api/progress", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { completions?: { slug: string; status: string }[] };
      const ids = (data.completions || []).filter((item) => item.status === "verified" || item.status === "submitted").map((item) => ({ "connect-wallet": 1, "robinhood-testnet": 2, "prove-transaction": 3, "explore-ecosystem": 4 }[item.slug as "connect-wallet" | "robinhood-testnet" | "prove-transaction" | "explore-ecosystem"])).filter((id): id is number => typeof id === "number");
      setCompleted((old) => [...new Set([...old, ...ids])]);
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/quests").then((response) => response.ok ? response.json() : Promise.reject(new Error("Quest API unavailable"))).then((data: { quests?: Quest[] }) => { if (Array.isArray(data.quests) && data.quests.length) setQuests(data.quests); }).catch(() => {});
    try { const savedProgress = JSON.parse(localStorage.getItem("flatquest-progress") || "[]"); const safeProgress = Array.isArray(savedProgress) ? savedProgress.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 4) : []; setCompleted(safeProgress); setExplored(safeProgress.includes(4)); const savedEvidence = localStorage.getItem("flatquest-verification-evidence"); if (savedEvidence) setVerificationEvidence(JSON.parse(savedEvidence)); } catch {}
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((session: { authenticated?: boolean; walletAddress?: string }) => {
      if (session.authenticated && session.walletAddress) { setAccount(session.walletAddress); setAuthenticated(true); loadPersistentProgress(); }
    }).catch(() => {});
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((a) => { const list = a as string[]; if (list[0]) setAccount((current) => current || list[0]); }).catch(() => {});
      window.ethereum.request({ method: "eth_chainId" }).then((id) => setChainId(String(id))).catch(() => {});
      const onAccounts = (...args: unknown[]) => {
        const next = ((args[0] as string[]) || [])[0] || "";
        setAccount(next);
        setAuthenticated(false);
        fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
      };
      const onChain = (...args: unknown[]) => setChainId(String(args[0] || ""));
      window.ethereum.on?.("accountsChanged", onAccounts);
      window.ethereum.on?.("chainChanged", onChain);
      return () => { window.ethereum?.removeListener?.("accountsChanged", onAccounts); window.ethereum?.removeListener?.("chainChanged", onChain); };
    }
  }, [loadPersistentProgress]);

  const save = (id: number) => setCompleted((old) => { const next = [...new Set([...old, id])]; localStorage.setItem("flatquest-progress", JSON.stringify(next)); return next; });
  const progress = Math.round((completed.length / quests.length) * 100);
  const filtered = useMemo(() => quests.filter((q) => filter === "All quests" || q.category === filter), [filter, quests]);

  async function connect() {
    if (connecting || retrySeconds > 0) return;
    setConnecting(true);
    setNotice("Looking for an installed browser wallet...");
    try {
      const provider = walletProvider || await discoverWalletProvider();
      if (!provider) throw new Error("No browser wallet was detected. Install or unlock MetaMask, then refresh FlatQuest.");
      setWalletProvider(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0];
      if (!address) { setNotice("No wallet account was returned."); return; }
      const id = await provider.request({ method: "eth_chainId" }) as string;
      setAccount(address); setChainId(id);
      const existingSessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      if (existingSessionResponse.ok) {
        const existingSession = await existingSessionResponse.json() as { authenticated?: boolean; walletAddress?: string };
        if (existingSession.authenticated && existingSession.walletAddress?.toLowerCase() === address.toLowerCase()) {
          setAuthenticated(true);
          await loadPersistentProgress();
          setNotice("Your wallet session is already verified. No new signature is needed.");
          return;
        }
      }
      setNotice("Check your wallet and sign the FlatQuest sign in message. This is not a transaction.");
      const challengeResponse = await fetch("/api/auth/nonce", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address })
      });
      const challenge = await challengeResponse.json() as { nonce?: string; message?: string; error?: string };
      if (challengeResponse.status === 429) {
        const retryAfter = Math.max(1, Number(challengeResponse.headers.get("Retry-After")) || 600);
        setAuthRetryAt(Date.now() + retryAfter * 1000);
        throw new Error("Too many sign in requests. FlatQuest will enable retry when the cooldown ends.");
      }
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message) throw new Error(challenge.error || "Could not create a sign in request.");
      const signature = await provider.request({ method: "personal_sign", params: [challenge.message, address] }) as string;
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, nonce: challenge.nonce, signature })
      });
      const result = await verifyResponse.json() as { authenticated?: boolean; error?: string };
      if (verifyResponse.status === 429) {
        const retryAfter = Math.max(1, Number(verifyResponse.headers.get("Retry-After")) || 600);
        setAuthRetryAt(Date.now() + retryAfter * 1000);
        throw new Error("Too many sign in attempts. FlatQuest will enable retry when the cooldown ends.");
      }
      if (!verifyResponse.ok || !result.authenticated) throw new Error(result.error || "Wallet sign in failed.");
      setAuthenticated(true);
      await loadPersistentProgress();
      setNotice("Wallet ownership verified. Your FlatQuest account is ready.");
    } catch (error) {
      setAuthenticated(false);
      const code = (error as { code?: number }).code;
      if (code === 4001) setNotice("Wallet request was rejected. Click Connect wallet when you are ready to approve it.");
      else if (code === -32002) setNotice("A wallet request is already pending. Open your wallet extension and complete or cancel it.");
      else setNotice(error instanceof Error ? error.message : "Wallet connection or sign in failed.");
    } finally {
      setConnecting(false);
    }
  }

  async function switchNetwork() {
    const provider = walletProvider || await discoverWalletProvider();
    if (!provider) { setNotice("No browser wallet detected. Install or unlock MetaMask first."); return; }
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_ID, chainName: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com/"] }] });
      } else { setNotice("Network switch was cancelled."); return; }
    }
    const id = await provider.request({ method: "eth_chainId" }) as string;
    setChainId(id);
    if (id.toLowerCase() === CHAIN_ID.toLowerCase()) {
      if (!authenticated) {
        setNotice("Robinhood Chain testnet detected. Sign in with your wallet to save this milestone.");
        return;
      }
      const response = await fetch("/api/verify-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: id })
      });
      const result = await response.json() as { verified?: boolean; error?: string };
      if (!response.ok || !result.verified) throw new Error(result.error || "Network verification failed.");
      save(2);
      await loadPersistentProgress();
      setNotice("Robinhood Chain testnet verified. This milestone is saved to your FlatQuest account.");
    }
  }

  async function verifyTransaction() {
    if (!account) { setNotice("Connect your wallet before submitting proof."); return; }
    if (chainId.toLowerCase() !== CHAIN_ID.toLowerCase()) { setNotice("Switch to Robinhood Chain testnet before verifying."); return; }
    if (!/^0x([A-Fa-f0-9]{64})$/.test(hash.trim())) { setNotice("Enter a valid 32-byte transaction hash."); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/verify-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questId: "prove-transaction", transactionHash: hash.trim(), walletAddress: account })
      });
      const result = await response.json() as { verified?: boolean; confirmations?: number; error?: string; transactionHash?: string; walletAddress?: string; blockNumber?: number; blockHash?: string; verifiedAt?: string; transactionTo?: string | null; transactionValue?: string; inputDataBytes?: number };
      if (!response.ok || !result.verified) {
        throw new Error(result.error || "Verification failed. Please try again.");
      }
      const evidence = { transactionHash: result.transactionHash || hash.trim(), walletAddress: result.walletAddress || account, blockNumber: result.blockNumber || 0, blockHash: result.blockHash || "", transactionTo: result.transactionTo ?? null, transactionValue: result.transactionValue || "0x0", inputDataBytes: result.inputDataBytes || 0, confirmations: result.confirmations || 0, verifiedAt: result.verifiedAt || new Date().toISOString() };
      localStorage.setItem("flatquest-verification-evidence", JSON.stringify(evidence));
      setVerificationEvidence(evidence);
      save(3); setNotice("Transaction receipt verified against Robinhood Chain testnet. Evidence is saved to your FlatQuest account.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Verification failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <main>
    <nav className="nav shell">
      <a className="wordmark" href="#"><Mark/><span>flat<span className="wordmark-light">quest</span></span></a>
      <div className="nav-links"><a href="#how-it-works">How it works</a><a href="#quests">Quests</a><a href="#about">Why FlatQuest</a><Link href="/dashboard">My dashboard ↗</Link></div>
      <button className="connect-button" onClick={connect} disabled={connecting || retrySeconds > 0} aria-busy={connecting}>{retrySeconds > 0 ? `Retry in ${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}` : connecting ? "Connecting..." : account ? (authenticated ? account.slice(0, 6) + "..." + account.slice(-4) : "Verify wallet") : "Connect wallet"} <span>{connecting ? "…" : "↗"}</span></button>
    </nav>

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

    <section className="stats shell"><div><strong>01</strong><span>Discover your next step</span></div><div><strong>02</strong><span>Complete a useful action</span></div><div><strong>03</strong><span>Keep proof of your progress</span></div></section>

    <section className="section shell" id="how-it-works">
      <div className="section-heading"><div><div className="eyebrow">A BETTER WAY TO GET STARTED</div><h2>Less guessing.<br/><em>More doing.</em></h2></div><p>Web3 can feel like a maze when you are new. FlatQuest turns the first steps into a guided path, so you always know what to do and why it matters.</p></div>
      <div className="steps-grid"><article><span className="step-number">01 / DISCOVER</span><div className="step-icon">⌕</div><h3>Find your next move</h3><p>Explore clear, beginner-friendly quests with a purpose, not a wall of confusing tasks.</p></article><article><span className="step-number">02 / PROVE</span><div className="step-icon">⌁</div><h3>Show what you did</h3><p>Onchain actions are checked against network evidence. A claim is never treated as proof.</p></article><article><span className="step-number">03 / GROW</span><div className="step-icon">↗</div><h3>Build real momentum</h3><p>See your milestones, understand what comes next, and keep moving through the ecosystem.</p></article></div>
    </section>

    <section className="quest-section" id="quests"><div className="shell quest-layout">
      <div className="quest-intro"><div className="eyebrow">YOUR NEXT STEP IS WAITING</div><h2>Start small.<br/><em>Go further.</em></h2><p>Choose a quest and build your understanding one meaningful action at a time.</p>
        <div className="progress-card"><div className="progress-top"><span>YOUR PROGRESS</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: progress + "%" }}/></div><div className="progress-caption">{completed.length} of {quests.length} milestones recorded</div><div className="progress-steps">{quests.map((q) => <span key={q.id} className={completed.includes(q.id) ? "progress-step done" : "progress-step"}/>)}</div></div>
      </div>
      <div className="quest-list">
        <div className="quest-toolbar"><div><span className="eyebrow">THE QUEST BOARD</span><h3>Pick your path</h3></div><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter quests"><option>All quests</option><option>Getting started</option><option>Onchain proof</option><option>Explore</option></select></div>
        {filtered.map((q) => <article className="quest-card" key={q.id}><div className="quest-card-top"><span className="quest-index">0{q.id}</span><span className="quest-category">{q.category}</span><span className={completed.includes(q.id) ? "status complete" : "status"}>{completed.includes(q.id) ? q.id === 3 && verificationEvidence ? "✓ Onchain verified" : q.id === 4 ? "✓ Self reported" : q.id === 1 && authenticated ? "✓ Wallet verified" : "✓ Recorded locally" : "○ Available"}</span></div><h4>{q.title}</h4><p>{q.description}</p><Link className="quest-guide-link" href={`/quests/${q.slug}`}>Read quest guide ↗</Link>
          {q.type === "transaction" && <div className="verify-field"><input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paste transaction hash (0x…)" aria-label="Transaction hash"/><button onClick={verifyTransaction} disabled={busy}>{busy ? "Checking..." : "Verify proof"}</button></div>}
          {q.type === "explore" && <div className="explore-action"><button onClick={() => { setExplored(!explored); if (!explored) { save(4); if (authenticated) fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questSlug: "explore-ecosystem", status: "submitted" }) }).then((response) => { if (!response.ok) throw new Error("Could not save progress"); setNotice("Explorer milestone saved to your FlatQuest account as a self-reported step."); }).catch(() => setNotice("Explorer milestone is recorded on this device only. Sign in and try again to sync it.")); else setNotice("Explorer milestone recorded on this device. Sign in to sync it to your account."); } }}>{explored ? "Explored ✓" : "I explored the ecosystem"}</button><a href="https://worldisflat.fun/" target="_blank" rel="noreferrer">Open World Is Flat ↗</a></div>}
          {q.type === "wallet" && <button className="quest-action" onClick={connect} disabled={connecting || retrySeconds > 0}>{retrySeconds > 0 ? `Try again in ${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}` : connecting ? "Connecting..." : account && authenticated ? "Wallet verified ✓" : account ? "Verify wallet ↗" : "Connect wallet ↗"}</button>}
          {q.type === "network" && <button className="quest-action" onClick={switchNetwork}>{chainId.toLowerCase() === CHAIN_ID.toLowerCase() ? "Robinhood Chain testnet ✓" : "Switch to testnet ↗"}</button>}
        </article>)}
        {verificationEvidence && <section className="evidence-card" aria-label="Transaction verification evidence"><div className="evidence-heading"><span className="evidence-badge">✓</span><div><strong>Transaction receipt verified</strong><small>ROBINHOOD CHAIN TESTNET · 46630</small></div></div><div className="evidence-grid"><div><small>TRANSACTION</small><a href={"https://explorer.testnet.chain.robinhood.com/tx/" + verificationEvidence.transactionHash} target="_blank" rel="noreferrer">{verificationEvidence.transactionHash.slice(0, 10)}…{verificationEvidence.transactionHash.slice(-8)} ↗</a></div><div><small>BLOCK</small><strong>{verificationEvidence.blockNumber.toLocaleString()}</strong></div><div><small>CONFIRMATIONS</small><strong>{verificationEvidence.confirmations}</strong></div><div><small>WALLET</small><strong>{verificationEvidence.walletAddress.slice(0, 8)}…{verificationEvidence.walletAddress.slice(-6)}</strong></div><div><small>RECIPIENT</small><strong>{verificationEvidence.transactionTo ? verificationEvidence.transactionTo.slice(0, 8) + "…" + verificationEvidence.transactionTo.slice(-6) : "Contract creation"}</strong></div><div><small>INPUT DATA</small><strong>{verificationEvidence.inputDataBytes} bytes</strong></div></div><p>Receipt evidence is saved to your FlatQuest account. This check confirms a successful transaction from your authenticated wallet. It does not prove a specific contract interaction or a particular ecosystem task.</p></section>}
        {notice && <div className="notice" role="status"><span>i</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
        <div className="demo-note">Signed in progress and verification evidence are stored in Neon. Anonymous progress remains on this device. Transaction proof is checked against Robinhood Chain testnet. No wallet custody, no invented completions.</div>
      </div>
    </div></section>

    <section className="closing shell" id="about"><div className="closing-mark"><Mark/></div><div><div className="eyebrow">THE POINT IS PROGRESS</div><h2>Every journey needs<br/>a <em>first proof.</em></h2></div><a className="primary-button" href="#quests">Take your first step <span>↗</span></a></section>
    <footer className="footer shell"><a className="wordmark" href="#"><Mark small/><span>flat<span className="wordmark-light">quest</span></span></a><span>Discover. Prove. Grow.</span><span>Built for the World Is Flat ecosystem.</span></footer>
  </main>;
}