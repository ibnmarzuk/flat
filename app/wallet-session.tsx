"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getAddress, stringToHex } from "viem";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";

type WalletProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: (...args: unknown[]) => void): void;
  removeListener?(event: string, callback: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
};

declare global {
  interface Window {
    ethereum?: WalletProvider & { providers?: WalletProvider[] };
  }
}

function discoverWallet(): Promise<WalletProvider | null> {
  return new Promise((resolve) => {
    let announced: WalletProvider | undefined;
    let metaMask: WalletProvider | undefined;
    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent<{ provider?: WalletProvider; info?: { rdns?: string } }>).detail;
      if (typeof detail?.provider?.request !== "function") return;
      announced ??= detail.provider;
      if (detail.info?.rdns === "io.metamask") metaMask = detail.provider;
    }
    function finish() {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      const legacy = window.ethereum;
      resolve(metaMask || legacy?.providers?.find((wallet) => wallet.isMetaMask)
        || (legacy?.isMetaMask ? legacy : undefined) || announced || legacy || null);
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (announced || window.ethereum) finish();
    else window.setTimeout(finish, 500);
  });
}

function firstAccount(accounts: unknown) {
  const address: unknown = Array.isArray(accounts) ? accounts[0] : undefined;
  return isValidWalletAddress(address) ? getAddress(address) : "";
}

type SessionResponse = { authenticated?: boolean; walletAddress?: string };

async function readSession(signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/auth/session", { cache: "no-store", signal });
  if (!response.ok) return "";
  const session = await response.json() as SessionResponse;
  return session.authenticated && isValidWalletAddress(session.walletAddress)
    ? session.walletAddress.toLowerCase()
    : "";
}

function useSessionState() {
  const providerRef = useRef<WalletProvider | null>(null);
  const removeWalletListeners = useRef<(() => void) | null>(null);
  const activeAccount = useRef<string | null>(null);
  const sessionAddress = useRef("");
  const walletVersion = useRef(0);
  const selectingAccount = useRef(false);
  const connectingRef = useRef(false);
  const verifying = useRef(false);
  const sessionWrite = useRef<Promise<void>>(Promise.resolve());

  const [account, setAccount] = useState("");
  const [wallet, setWallet] = useState("");
  const [chainId, setChainId] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (!retryAt) { setRetrySeconds(0); return; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (!remaining) setRetryAt(0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const setSession = useCallback((address: string) => {
    sessionAddress.current = address.toLowerCase();
    setWallet(sessionAddress.current);
  }, []);

  const revokeSession = useCallback(() => {
    setSession("");
    // A verification response can still be setting its cookie. Revoke that
    // cookie after the response and before starting another sign-in.
    const revoke = sessionWrite.current.then(async () => {
      await fetch("/api/auth/session", { method: "DELETE" });
    });
    sessionWrite.current = revoke.catch(() => {});
    return sessionWrite.current;
  }, [setSession]);

  const updateAccount = useCallback((address: string) => {
    const previous = activeAccount.current;
    if (previous?.toLowerCase() === address.toLowerCase()) return;
    activeAccount.current = address;
    walletVersion.current += 1;
    setAccount(address);
    if (verifying.current || (sessionAddress.current && sessionAddress.current !== address.toLowerCase())) {
      void revokeSession();
    }
    if (previous !== null && !selectingAccount.current) {
      setRetryAt(0);
      setNotice(address ? "Wallet changed. Verify this account to see its progress." : "Wallet disconnected. Connect it to continue.");
    }
  }, [revokeSession]);

  const watchWallet = useCallback((provider: WalletProvider) => {
    if (providerRef.current === provider) return;
    removeWalletListeners.current?.();
    providerRef.current = provider;
    const onAccounts = (accounts: unknown) => updateAccount(firstAccount(accounts));
    const onChain = (id: unknown) => setChainId(typeof id === "string" ? id : "");
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    removeWalletListeners.current = () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      providerRef.current = null;
    };
  }, [updateAccount]);

  const getWalletProvider = useCallback(async () => {
    const provider = providerRef.current || await discoverWallet();
    if (provider) watchWallet(provider);
    return provider;
  }, [watchWallet]);

  useEffect(() => {
    const controller = new AbortController();
    async function restore() {
      const [provider, savedWallet] = await Promise.all([
        discoverWallet(),
        readSession(controller.signal).catch(() => "")
      ]);
      if (controller.signal.aborted) return;
      if (provider) {
        watchWallet(provider);
        const version = walletVersion.current;
        const [accounts, chain] = await Promise.allSettled([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" })
        ]);
        if (controller.signal.aborted) return;
        if (accounts.status === "fulfilled" && version === walletVersion.current) {
          updateAccount(firstAccount(accounts.value));
        }
        if (chain.status === "fulfilled" && typeof chain.value === "string") setChainId(chain.value);
      }
      if (savedWallet && activeAccount.current !== null && savedWallet !== activeAccount.current.toLowerCase()) {
        void revokeSession();
      } else if (savedWallet) {
        setSession(savedWallet);
      }
    }
    void restore().catch(() => {}).finally(() => {
      if (!controller.signal.aborted) setCheckingSession(false);
    });
    return () => {
      controller.abort();
      removeWalletListeners.current?.();
    };
  }, [revokeSession, setSession, updateAccount, watchWallet]);

  const isCurrentWallet = useCallback((address: string) => (
    !!address && sessionAddress.current === address.toLowerCase()
  ), []);

  const expireSession = useCallback((address: string) => {
    if (isCurrentWallet(address)) setSession("");
  }, [isCurrentWallet, setSession]);

  function checkRateLimit(response: Response) {
    if (response.status !== 429) return;
    const delay = Math.max(1, Number(response.headers.get("Retry-After")) || 600);
    setRetryAt(Date.now() + delay * 1000);
    throw new Error("Too many sign-in attempts. Wait for the cooldown before trying again.");
  }

  async function connect() {
    if (checkingSession || connectingRef.current || retryAt > Date.now()) return;
    connectingRef.current = true;
    setConnecting(true);
    setNotice("Looking for your browser wallet…");
    let version: number | undefined;
    try {
      const provider = await getWalletProvider();
      if (!provider) throw new Error("Open FlatQuest in a browser with MetaMask or another Ethereum wallet.");
      selectingAccount.current = true;
      const selected = firstAccount(await provider.request({ method: "eth_requestAccounts" }));
      if (!selected) throw new Error("No wallet account was returned.");
      // The initial accountsChanged event can fire while access is granted.
      // Start the sign-in attempt only after checking the selected account.
      const selectionVersion = walletVersion.current;
      const current = firstAccount(await provider.request({ method: "eth_accounts" }));
      if (selected !== current || (selectionVersion !== walletVersion.current && activeAccount.current !== current)) {
        setNotice("The wallet account changed. Choose an account and try again.");
        return;
      }
      updateAccount(current);
      selectingAccount.current = false;
      version = walletVersion.current;
      await sessionWrite.current;
      const id = await provider.request({ method: "eth_chainId" });
      if (version !== walletVersion.current) return;
      if (typeof id === "string") setChainId(id);

      const existingWallet = await readSession();
      if (version !== walletVersion.current) return;
      if (existingWallet === selected.toLowerCase()) {
        setSession(existingWallet);
        setNotice("This wallet is already signed in.");
        return;
      }
      setSession("");
      setNotice("Open your wallet and sign the FlatQuest sign-in message.");
      const challengeResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: selected })
      });
      if (version !== walletVersion.current) return;
      checkRateLimit(challengeResponse);
      const challenge = await challengeResponse.json() as { nonce?: string; message?: string; error?: string };
      if (version !== walletVersion.current) return;
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error || "Could not create a sign-in request.");
      }
      const signature = await provider.request({
        method: "personal_sign",
        params: [stringToHex(challenge.message), selected]
      });
      if (version !== walletVersion.current) return;

      verifying.current = true;
      const request = fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: selected, nonce: challenge.nonce, signature })
      });
      sessionWrite.current = request.then(() => {}, () => {});
      const response = await request;
      if (version !== walletVersion.current) return;
      checkRateLimit(response);
      const result = await response.json() as SessionResponse & { error?: string };
      if (version !== walletVersion.current) return;
      if (!response.ok || !result.authenticated || result.walletAddress?.toLowerCase() !== selected.toLowerCase()) {
        throw new Error(result.error || "Wallet sign-in failed. Try again.");
      }
      setSession(selected);
      setNotice("Wallet verified. Your progress is saved to this account.");
    } catch (error) {
      if (version !== undefined && version !== walletVersion.current) return;
      const code = (error as { code?: number } | null)?.code;
      if (code === 4001) setNotice("The wallet request was declined. Try again when you are ready.");
      else if (code === -32002) setNotice("Open your wallet to complete the pending request.");
      else setNotice(error instanceof Error ? error.message : "Wallet sign-in failed. Try again.");
    } finally {
      selectingAccount.current = false;
      verifying.current = false;
      connectingRef.current = false;
      setConnecting(false);
    }
  }

  return {
    account: account || wallet, wallet, chainId, checkingSession, connecting,
    notice, setNotice, retrySeconds, connect, getWalletProvider, setChainId,
    isCurrentWallet, expireSession
  };
}

const WalletSessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);

export function WalletSession({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return <WalletSessionContext.Provider value={session}>
    {session.notice && <div className="notice global-notice" role="status">
      <span aria-hidden="true">i</span>
      {session.notice}
      <button onClick={() => session.setNotice("")} aria-label="Dismiss message">×</button>
    </div>}
    {children}
  </WalletSessionContext.Provider>;
}

export function useWalletSession() {
  const session = useContext(WalletSessionContext);
  if (!session) throw new Error("WalletSession is required.");
  return session;
}
