import { concatHex, numberToHex, type Address, type Hex } from "viem";
import type { SwapHop, SwapTradeType } from "../domain";

function encodeTickSpacing(value: number): Hex {
  if (!Number.isInteger(value) || value <= 0 || value > 0x7fffff) {
    throw new Error(`Invalid CL tick spacing: ${value}`);
  }
  return numberToHex(value, { size: 3 });
}

export function encodeClPath(hops: readonly SwapHop[], tradeType: SwapTradeType): Hex {
  if (hops.length === 0) throw new Error("A CL path requires at least one pool");
  const ordered = tradeType === "exactOutput" ? [...hops].reverse().map((hop) => ({ ...hop, tokenIn: hop.tokenOut, tokenOut: hop.tokenIn })) : hops;
  const parts: Hex[] = [ordered[0].tokenIn];
  for (const hop of ordered) parts.push(encodeTickSpacing(hop.tickSpacing), hop.tokenOut);
  return concatHex(parts);
}

export function pathEndpoints(path: readonly SwapHop[]): [Address, Address] {
  if (!path.length) throw new Error("Missing path");
  return [path[0].tokenIn, path[path.length - 1].tokenOut];
}
