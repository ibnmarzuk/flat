"use client";

import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, cb: (...args: unknown[]) => void) => void; removeListener?: (event: string, cb: (...args: unknown[]) => void) => void } }
}

const CHAIN_ID = "0xB626"; // Robinhood Chain testnet, 46630
const RPC = "https://rpc.testnet.chain.robinhood.com";
const quests = [
  { id: 1, category: "Getting started", title: "Connect your wallet", description: "Bring your onchain identity into the journey. Your wallet stays in your control.", reward: "First step", type: "wallet" },
  { id: 2, category: "Getting started", title: "Find your place on Robinhood Chain", description: "Switch to the Robinhood Chain testnet and get familiar with the network.", reward: "Network ready", type: "network" },
  { id: 3, category: "Onchain proof", title: "Prove an onchain transaction", description: "Submit a transaction hash. FlatQuest checks the receipt, sender and confirmations against the testnet.", reward: "Verified proof", type: "transaction" },
  { id: 4, category: "Explore", title: "Explore the ecosystem", description: "Discover a project or useful resource in the World Is Flat ecosystem. Record what you explored.", reward: "Explorer", type: "explore" }
];

function Mark({ small = false }: { small?: boolean }) {
  return <span className={small ? "brand-mark small" : "brand-mark"} aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M14 43.5C19.2 43.5 20.3 32 29 32C36.2 32 36.4 20.5 49 20.5" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round"/><circle cx="14" cy="43.5" r="5" fill="currentColor"/><circle cx="29" cy="32" r="5" fill="currentColor" stroke="#C7F36B" strokeWidth="2"/><path d="m42 20.5 5.2 5.2 8.3-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

export default function Home() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [completed, setCompleted] = useState<number[]>([]);
  const [filter, setFilter] = useState("All quests");
  const [hash, setHash] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [explored, setExplored] = useState(false);

  useEffect(() => {
    try { setCompleted(JSON.parse(localStorage.getItem("flatquest-progress") || "[]")); } catch {}
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((a) => { const list = a as string[]; if (list[0]) setAccount(list[0]); }).catch(() => {});
      window.ethereum.request({ method: "eth_chainId" }).then((id) => setChainId(String(id))).catch(() => {});
      const onAccounts = (...args: unknown[]) => setAccount(((args[0] as string[]) || [])[0] || "");
      const onChain = (...args: unknown[]) => setChainId(String(args[0] || ""));
      window.ethereum.on?.("accountsChanged", onAccounts);
      window.ethereum.on?.("chainChanged", onChain);
      return () => { window.ethereum?.removeListener?.("accountsChanged", onAccounts); window.ethereum?.removeListener?.("chainChanged", onChain); };
    }
  }, []);

  const save = (id: number) => setCompleted((old) => { const next = [...new Set([...old, id])]; localStorage.setItem("flatquest-progress", JSON.stringify(next)); return next; });
  const progress = Math.round((completed.length / quests.length) * 100);
  const filtered = useMemo(() => quests.filter((q) => filter === "All quests" || q.category === filter), [filter]);

  async function connect() {
    if (!window.ethereum) { setNotice("Install a browser wallet such as MetaMask to connect."); return; }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const id = await window.ethereum.request({ method: "eth_chainId" }) as string;
      setAccount(accounts[0] || ""); setChainId(id);
      if (accounts[0]) save(1);
      setNotice("Wallet connected. Your wallet remains in your control.");
    } catch { setNotice("Wallet connection was cancelled or unavailable."); }
  }

  async function switchNetwork() {
    if (!window.ethereum) { setNotice("Connect a browser wallet first."); return; }
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_ID, chainName: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com/"] }] });
      } else { setNotice("Network switch was cancelled."); return; }
    }
    const id = await window.ethereum.request({ method: "eth_chainId" }) as string;
    setChainId(id);
    if (id.toLowerCase() === CHAIN_ID.toLowerCase()) { save(2); setNotice("Robinhood Chain testnet detected."); }
  }

  async function verifyTransaction() {
    if (!account) { setNotice("Connect your wallet before submitting proof."); return; }
    if (chainId.toLowerCase() !== CHAIN_ID.toLowerCase()) { setNotice("Switch to Robinhood Chain testnet before verifying."); return; }
    if (!/^0x([A-Fa-f0-9]{64})$/.test(hash.trim())) { setNotice("Enter a valid 32-byte transaction hash."); return; }
    setBusy(true); setNotice("");
    try {
      const rpc = async (method: string, params: unknown[]) => {
        const response = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        if (!response.ok) throw new Error("RPC request failed");
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || "RPC error");
        return data.result;
      };
      const receipt = await rpc("eth_getTransactionReceipt", [hash.trim()]) as { status: string; blockNumber: string; from: string } | null;
      if (!receipt) throw new Error("Transaction not found yet. Check the hash and try again.");
      if (receipt.status !== "0x1") throw new Error("This transaction did not succeed.");
      if (receipt.from.toLowerCase() !== account.toLowerCase()) throw new Error("The transaction sender does not match your connected wallet.");
      const latest = BigInt(await rpc("eth_blockNumber", []) as string);
      const included = BigInt(receipt.blockNumber);
      const confirmations = Number(latest - included + 1n);
      if (confirmations < 2) throw new Error("This transaction needs at least 2 confirmations. Try again shortly.");
      save(3); setNotice("Transaction verified on Robinhood Chain testnet with " + confirmations + " confirmations.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Verification failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <main>
    <nav className="nav shell">
      <a className="wordmark" href="#"><Mark/><span>flat<span className="wordmark-light">quest</span></span></a>
      <div className="nav-links"><a href="#how-it-works">How it works</a><a href="#quests">Quests</a><a href="#about">Why FlatQuest</a></div>
      <button className="connect-button" onClick={connect}>{account ? account.slice(0, 6) + "..." + account.slice(-4) : "Connect wallet"} <span>↗</span></button>
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
        <div className="progress-card"><div className="progress-top"><span>YOUR PROGRESS</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: progress + "%" }}/></div><div className="progress-caption">{completed.length} of {quests.length} milestones completed</div><div className="progress-steps">{quests.map((q) => <span key={q.id} className={completed.includes(q.id) ? "progress-step done" : "progress-step"}/>)}</div></div>
      </div>
      <div className="quest-list">
        <div className="quest-toolbar"><div><span className="eyebrow">THE QUEST BOARD</span><h3>Pick your path</h3></div><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter quests"><option>All quests</option><option>Getting started</option><option>Onchain proof</option><option>Explore</option></select></div>
        {filtered.map((q) => <article className="quest-card" key={q.id}><div className="quest-card-top"><span className="quest-index">0{q.id}</span><span className="quest-category">{q.category}</span><span className={completed.includes(q.id) ? "status complete" : "status"}>{completed.includes(q.id) ? "✓ Completed" : "○ Available"}</span></div><h4>{q.title}</h4><p>{q.description}</p>
          {q.type === "transaction" && <div className="verify-field"><input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paste transaction hash (0x…)" aria-label="Transaction hash"/><button onClick={verifyTransaction} disabled={busy}>{busy ? "Checking..." : "Verify proof"}</button></div>}
          {q.type === "explore" && <div className="explore-action"><button onClick={() => { setExplored(!explored); if (!explored) { save(4); setNotice("Explorer milestone recorded on this device. This is not an onchain verification."); } }}>{explored ? "Explored ✓" : "I explored the ecosystem"}</button><a href="https://worldisflat.fun/" target="_blank" rel="noreferrer">Open World Is Flat ↗</a></div>}
          {q.type === "wallet" && <button className="quest-action" onClick={connect}>{account ? "Wallet connected ✓" : "Connect wallet ↗"}</button>}
          {q.type === "network" && <button className="quest-action" onClick={switchNetwork}>{chainId.toLowerCase() === CHAIN_ID.toLowerCase() ? "Robinhood Chain testnet ✓" : "Switch to testnet ↗"}</button>}
        </article>)}
        {notice && <div className="notice" role="status"><span>i</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
        <div className="demo-note">Progress is currently stored in this browser. Transaction proof is checked against Robinhood Chain testnet. No wallet custody, no invented completions.</div>
      </div>
    </div></section>

    <section className="closing shell" id="about"><div className="closing-mark"><Mark/></div><div><div className="eyebrow">THE POINT IS PROGRESS</div><h2>Every journey needs<br/>a <em>first proof.</em></h2></div><a className="primary-button" href="#quests">Take your first step <span>↗</span></a></section>
    <footer className="footer shell"><a className="wordmark" href="#"><Mark small/><span>flat<span className="wordmark-light">quest</span></span></a><span>Discover. Prove. Grow.</span><span>Built for the World Is Flat ecosystem.</span></footer>
  </main>;
}