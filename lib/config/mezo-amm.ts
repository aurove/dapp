import type { Address } from "viem";

/** Official Tigris / Mezo AMM (volatile + stable basic pools) and CL factories. */
export const MEZO_BASIC_ROUTER_ABI = [
  {
    type: "function",
    name: "poolFor",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "factory", type: "address" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getAmountsIn",
    stateMutability: "view",
    inputs: [
      { name: "amountOut", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapTokensForExactTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountOut", type: "uint256" },
      { name: "amountInMax", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

export type MezoAmmAddresses = {
  router: Address;
  poolFactory: Address;
};

export const MEZO_AMM_BY_CHAIN: Record<number, MezoAmmAddresses> = {
  31612: {
    router: "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706",
    poolFactory: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
  },
  31611: {
    router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
    poolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A",
  },
  31337: {
    router: "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706",
    poolFactory: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
  },
};

export function getMezoAmmAddresses(chainId: number): MezoAmmAddresses | null {
  return MEZO_AMM_BY_CHAIN[chainId] ?? null;
}
