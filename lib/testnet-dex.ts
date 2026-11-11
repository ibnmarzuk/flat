import { parseAbi } from "viem";
export const tradeAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)",
  "function factory() view returns (address)", "function WETH() view returns (address)",
  "function getHoard(address tokenA,address tokenB) view returns (address)",
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 timestamp)",
  "function token0() view returns (address)", "function token1() view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)"
]);
export type TradeQuote = {
  direction: "buy" | "sell";
  amountIn: string;
  amountOut: string;
  minimumOut: string;
  deadline: number;
  expiresAt: number;
  priceEffectBps: number;
  chainId: number;
};
export type TradeProof = {
  transactionHash: string;
  direction: "buy" | "sell";
  amount: string;
  ethAmount: string;
  blockNumber: string;
  confirmations: number;
};
