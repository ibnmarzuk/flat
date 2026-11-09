type WalletRequestProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type WalletNetwork = {
  chainId: string;
  chainName: string;
  rpcUrl: string;
  explorer: string;
};

export async function selectWalletNetwork(provider: WalletRequestProvider, network: WalletNetwork) {
  const readChain = async () => String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  const switchChain = () => provider.request({
    method: "wallet_switchEthereumChain", params: [{ chainId: network.chainId }]
  });
  if (await readChain() !== network.chainId) {
    try {
      await switchChain();
    } catch (error) {
      if ((error as { code?: number } | null)?.code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: network.chainId,
          chainName: network.chainName,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorer]
        }]
      });
      if (await readChain() !== network.chainId) await switchChain();
    }
  }
  return readChain();
}
