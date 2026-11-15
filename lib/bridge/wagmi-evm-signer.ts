import type {
  Chain,
  Network,
  SignAndSendSigner,
  UnsignedTransaction,
} from "@wormhole-foundation/sdk";
import {
  type Address,
  type Chain as ViemChain,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeErrorResult,
} from "viem";

const NTT_MANAGER_ERRORS = [
  {
    type: "error",
    name: "TransferAmountHasDust",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "dust", type: "uint256" },
    ],
  },
] as const;

type EvmTxRequest = {
  to?: unknown;
  data?: unknown;
  value?: unknown;
  gasLimit?: unknown;
  maxFeePerGas?: unknown;
  maxPriorityFeePerGas?: unknown;
  nonce?: unknown;
};

/** EIP-7825 / Base per-tx gas ceiling (2^24). Exceeding this yields RPC 0x14a34. */
const BASE_MAX_TX_GAS = 16_777_216n;

/** Soft ceiling used when estimating on other chains so wallets never fall back to block.gasLimit. */
const DEFAULT_MAX_TX_GAS = 30_000_000n;

const GAS_BUFFER_BPS = 12500n; // +25%
const BPS_DENOM = 10000n;

function toHexQuantity(value: unknown): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (typeof value === "object" && value !== null && "toString" in value) {
    return BigInt(String((value as { toString(): string }).toString()));
  }
  return undefined;
}

function bytesToHex(bytes: Uint8Array): Hex {
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex as Hex;
}

function toHexData(value: unknown): Hex | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  return undefined;
}

function maxTxGasForChain(chainId: number | undefined): bigint {
  // Base mainnet + Base Sepolia enforce EIP-7825 (2^24).
  if (chainId === 8453 || chainId === 84532) return BASE_MAX_TX_GAS;
  return DEFAULT_MAX_TX_GAS;
}

function withGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_BPS) / BPS_DENOM;
}

function enrichEstimateGasError(error: unknown): Error {
  const data =
    (error as { data?: Hex })?.data ??
    (error as { cause?: { data?: Hex } })?.cause?.data ??
    (error as { walk?: (fn: (e: unknown) => unknown) => unknown })?.walk?.((e) =>
      (e as { data?: Hex })?.data ? e : undefined,
    );

  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    try {
      const decoded = decodeErrorResult({ abi: NTT_MANAGER_ERRORS, data: data as Hex });
      if (decoded.errorName === "TransferAmountHasDust") {
        return new Error(
          "Amount has dust below Wormhole NTT precision (8 decimals). Use Max or round down the amount.",
        );
      }
    } catch {
      // keep original error
    }
  }

  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Wormhole SignAndSendSigner backed by a wagmi/viem wallet client.
 * Used so NTT unsigned transactions from the SDK can be signed in the browser.
 *
 * EvmNtt often leaves `gasLimit` null. Without an explicit gas, some wallets
 * fall back to block.gasLimit (~120M on Base), which Base rejects as above the
 * 16,777,216 per-tx ceiling. We always resolve and cap gas before send.
 */
export class WagmiEvmSignAndSendSigner<N extends Network, C extends Chain>
  implements SignAndSendSigner<N, C>
{
  constructor(
    private readonly chainName: C,
    private readonly account: Address,
    private readonly walletClient: WalletClient,
    private readonly publicClient: PublicClient,
    private readonly viemChain?: ViemChain,
  ) {}

  chain(): C {
    return this.chainName;
  }

  address(): string {
    return this.account;
  }

  async signAndSend(txs: UnsignedTransaction<N, C>[]): Promise<string[]> {
    const hashes: string[] = [];
    const chain = this.viemChain ?? this.walletClient.chain;
    const chainId = chain?.id ?? this.publicClient.chain?.id;
    const maxGas = maxTxGasForChain(chainId);

    for (const unsigned of txs) {
      const request = (unsigned as UnsignedTransaction<N, C> & { transaction?: EvmTxRequest }).transaction;
      if (!request?.to) {
        throw new Error(`Missing destination for Wormhole tx: ${unsigned.description}`);
      }

      const to = String(request.to) as Address;
      const data = toHexData(request.data);
      const value = toHexQuantity(request.value) ?? 0n;
      let gas = toHexQuantity(request.gasLimit);

      const needsEstimate = gas === undefined || gas > maxGas;
      if (needsEstimate) {
        try {
          const estimated = await this.publicClient.estimateGas({
            account: this.account,
            to,
            data,
            value,
          });
          gas = withGasBuffer(estimated);
        } catch (error) {
          // If SDK supplied an over-limit gas, still clamp so the wallet can attempt send.
          if (gas !== undefined && gas > maxGas) {
            gas = maxGas;
          } else {
            throw enrichEstimateGasError(error);
          }
        }
      }

      if (gas !== undefined && gas > maxGas) {
        gas = maxGas;
      }

      const hash = await this.walletClient.sendTransaction({
        account: this.account,
        chain,
        to,
        data,
        value,
        gas,
        maxFeePerGas: toHexQuantity(request.maxFeePerGas),
        maxPriorityFeePerGas: toHexQuantity(request.maxPriorityFeePerGas),
        nonce: request.nonce !== undefined && request.nonce !== null
          ? Number(request.nonce)
          : undefined,
      });

      await this.publicClient.waitForTransactionReceipt({ hash });
      hashes.push(hash);
    }

    return hashes;
  }
}
