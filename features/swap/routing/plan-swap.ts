import type { SwapExecutionPlan, SwapIntent, SwapQuote, SwapRegistry } from "../domain";
import { encodeClPath } from "./encode-cl-path";
import { findClRoute } from "./find-cl-route";

const BPS = 10_000n;
const minOut = (amount: bigint, bps: number) => amount * (BPS - BigInt(bps)) / BPS;
const maxIn = (amount: bigint, bps: number) => (amount * (BPS + BigInt(bps)) + BPS - 1n) / BPS;

export function planSwap(intent: SwapIntent, registry: SwapRegistry, quote?: SwapQuote): SwapExecutionPlan {
  if (intent.chainId !== registry.chainId) return { type: "unsupported", reason: "Unsupported network" };
  if (intent.tokenIn.id === intent.tokenOut.id) return { type: "unsupported", reason: "Select two different assets" };
  if (intent.amount <= 0n) return { type: "unsupported", reason: "Enter an amount" };
  if (intent.tokenIn.form !== "venft" && intent.tokenIn.form !== "tranche" && intent.tokenIn.form !== "id20" && intent.tokenIn.form !== "erc20") {
    return { type: "unsupported", reason: "The selected asset cannot be sold through the swap interface" };
  }
  if (intent.tokenOut.form !== "id20" && intent.tokenOut.form !== "erc20") {
    return { type: "unsupported", reason: "Only ERC-20 tokens can be selected as swap outputs" };
  }
  const hops = findClRoute(registry.pools, intent.tokenIn.executableAddress, intent.tokenOut.executableAddress);
  if (!hops) return { type: "unsupported", reason: "No route available" };
  const encodedPath = encodeClPath(hops, intent.tradeType);
  const amountIn = quote?.amountIn ?? (intent.tradeType === "exactInput" ? intent.amount : 0n);
  const amountOut = quote?.amountOut ?? (intent.tradeType === "exactOutput" ? intent.amount : 0n);
  const amountOutMinimum = quote ? minOut(quote.amountOut, intent.slippageBps) : 0n;
  const amountInMaximum = quote ? maxIn(quote.amountIn, intent.slippageBps) : 0n;
  const common = {
    tradeType: intent.tradeType, amountSpecified: intent.amount, amountIn, amountOut,
    amountOutMinimum, amountInMaximum, encodedPath, hops, recipient: intent.recipient,
    deadline: intent.deadline, expectedAsset: intent.tokenOut,
  } as const;

  if (intent.tokenIn.form === "erc20" || intent.tokenIn.form === "id20") {
    const single = hops.length === 1;
    const functionName = intent.tradeType === "exactInput"
      ? (single ? "exactInputSingle" : "exactInput")
      : (single ? "exactOutputSingle" : "exactOutput");
    const params = single
      ? intent.tradeType === "exactInput"
        ? { tokenIn: intent.tokenIn.executableAddress, tokenOut: intent.tokenOut.executableAddress, tickSpacing: hops[0].tickSpacing, recipient: intent.recipient, deadline: intent.deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0n }
        : { tokenIn: intent.tokenIn.executableAddress, tokenOut: intent.tokenOut.executableAddress, tickSpacing: hops[0].tickSpacing, recipient: intent.recipient, deadline: intent.deadline, amountOut, amountInMaximum, sqrtPriceLimitX96: 0n }
      : intent.tradeType === "exactInput"
        ? { path: encodedPath, recipient: intent.recipient, deadline: intent.deadline, amountIn, amountOutMinimum }
        : { path: encodedPath, recipient: intent.recipient, deadline: intent.deadline, amountOut, amountInMaximum };
    return {
      type: "directClSwap", ...common, routerAddress: registry.clRouter.address,
      routerLabel: "Direct pool route", contractFunction: functionName,
      contractCall: { address: registry.clRouter.address, abi: registry.clRouter.abi, functionName, args: [params] },
      approval: { kind: "erc20", token: intent.tokenIn.address, spender: registry.clRouter.address, amount: intent.tradeType === "exactInput" ? amountIn : amountInMaximum },
      affectedPortfolioDomains: [...new Set([intent.tokenIn.balanceDomain, intent.tokenOut.balanceDomain])],
    };
  }

  const params = {
    tokenOut: intent.tokenOut.executableAddress,
    amountOutMinimum,
    amountOut,
    receiver: intent.recipient,
    deadline: intent.deadline,
    path: encodedPath,
  };
  if (intent.tokenIn.form === "tranche" && intent.tokenIn.trancheId !== undefined) {
    const wrapAmount = intent.tradeType === "exactInput" ? amountIn : amountInMaximum;
    const functionName = intent.tradeType === "exactInput" ? "zapTrancheExactInput" : "zapTrancheExactOutput";
    return {
      type: "auroveWrapThenSwap", ...common, trancheId: intent.tokenIn.trancheId, wrapAmount,
      routerAddress: registry.auroveRouter.address, routerLabel: "Aurove route", contractFunction: functionName,
      contractCall: { address: registry.auroveRouter.address, abi: registry.auroveRouter.abi, functionName, args: [intent.tokenIn.trancheId, wrapAmount, params] },
      approval: { kind: "erc1155", token: registry.ledger.address, operator: registry.auroveRouter.address },
      affectedPortfolioDomains: [...new Set(["tranches" as const, "id20" as const, intent.tokenOut.balanceDomain, "rewards" as const])],
    };
  }
  if (intent.tokenIn.form === "venft" && intent.tokenIn.variant && intent.tokenIn.epochs !== undefined && intent.tokenIn.tokenId !== undefined) {
    if (intent.tradeType !== "exactInput") {
      return { type: "unsupported", reason: "veBTC and veMEZO positions can only be sold as exact-input swaps", hops };
    }
    const deposit = { variant: intent.tokenIn.variant, epochs: intent.tokenIn.epochs, value: intent.tokenIn.tokenId };
    const functionName = "zapVeNftExactInput";
    return {
      type: "auroveVeNftThenSwap", ...common, deposit,
      routerAddress: registry.auroveRouter.address, routerLabel: "Aurove route", contractFunction: functionName,
      contractCall: { address: registry.auroveRouter.address, abi: registry.auroveRouter.abi, functionName, args: [deposit, params] },
      approval: { kind: "erc721", token: intent.tokenIn.address, operator: registry.auroveRouter.address, tokenId: intent.tokenIn.tokenId },
      affectedPortfolioDomains: [...new Set(["wallet" as const, "tranches" as const, "id20" as const, intent.tokenOut.balanceDomain, "rewards" as const])],
    };
  }
  return { type: "unsupported", reason: "This asset form is not supported by the configured Aurove router", hops };
}
