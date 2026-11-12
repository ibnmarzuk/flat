export const XP = {
  connectWallet: 5,
  verifyWallet: 5,
  addressProof: 5,
  swap: 1,
  testnetSend: 2,
  referral: 10
} as const;

export type XpProgress = {
  xp: number;
  swapCount: number;
  testnetSwapCount: number;
  testnetTradeCount: number;
  testnetSendCount: number;
  referralCount: number;
  onchainActionCount: number;
  walletVerified: boolean;
  addressProven: boolean;
};
