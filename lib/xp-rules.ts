export const XP = {
  connectWallet: 5,
  verifyWallet: 5,
  addressProof: 5,
  swap: 1
} as const;

export type XpProgress = {
  xp: number;
  swapCount: number;
  testnetSwapCount: number;
  testnetTradeCount: number;
  walletVerified: boolean;
  addressProven: boolean;
};
