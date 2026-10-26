import {
  encodeFunctionData,
  erc1155Abi,
  erc20Abi,
  erc721Abi,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type WalletClient,
} from "viem";
import { sendCalls, waitForCallsStatus } from "viem/actions";
import { isTokenApprovalSatisfied, type TxStep } from "@/lib/tx-flow";
import { VE_NFT_PERMANENT_LOCK_ABI } from "@/lib/tx-flow/venft";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import { deriveTrancheId } from "@/components/features/earn/utils/tranche";
import {
  BRIDGE_FAMILY_CONFIG,
  type BridgeFamily,
  type BridgeSource,
} from "@/components/features/bridge/bridge-sources";
import type { TxFlowRuntimeContext } from "@/lib/tx-flow/types";
import { mezoTestnetChain } from "@/lib/config/chains";

export type BridgeVaultBatchCall = {
  to: Address;
  data: Hex;
};

export type BridgeVaultConversionContracts = {
  ledger: Address;
  id20: Address;
  vault: Address;
  vaultAbi: Abi;
};

const DEPOSIT_VENFT_ABI = [
  {
    type: "function",
    name: "depositVeNft",
    stateMutability: "nonpayable",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "epochs", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "trancheId", type: "uint256" }],
  },
] as const satisfies Abi;

function callFromAbi(params: {
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}): BridgeVaultBatchCall {
  return {
    to: params.to,
    data: encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as never,
    }),
  };
}

/**
 * Builds the Mezo-side calls that convert a withdraw funding source into Horizon
 * vault shares. Approvals already satisfied on-chain are omitted.
 *
 * Intended to run via EIP-5792 `wallet_sendCalls` (with viem sequential fallback).
 */
export async function buildBridgeVaultConversionCalls(params: {
  source: BridgeSource;
  amount: bigint;
  account: Address;
  family: BridgeFamily;
  contracts: BridgeVaultConversionContracts;
  ctx: Pick<TxFlowRuntimeContext, "account" | "publicClient">;
}): Promise<BridgeVaultBatchCall[]> {
  const { source, amount, account, family, contracts, ctx } = params;
  if (source.kind === "vault" || source.kind === "peer") return [];
  if (amount <= 0n) return [];

  const config = BRIDGE_FAMILY_CONFIG[family];
  const calls: BridgeVaultBatchCall[] = [];
  const epochs = BigInt(config.epochs);

  if (source.kind === "venft") {
    if (source.isPermanent) {
      const locked = await ctx.publicClient.readContract({
        address: source.contractAddress,
        abi: VE_NFT_PERMANENT_LOCK_ABI,
        functionName: "locked",
        args: [source.tokenId],
      });
      const isPermanent = Array.isArray(locked)
        ? Boolean(locked[2])
        : Boolean((locked as { isPermanent?: boolean } | null)?.isPermanent);
      if (isPermanent) {
        calls.push(
          callFromAbi({
            to: source.contractAddress,
            abi: VE_NFT_PERMANENT_LOCK_ABI,
            functionName: "unlockPermanent",
            args: [source.tokenId],
          }),
        );
      }
    }

    const nftApproved = await isTokenApprovalSatisfied(ctx, {
      standard: "erc721",
      token: source.contractAddress,
      operator: contracts.ledger,
      scope: { kind: "token", tokenId: source.tokenId },
    });
    if (!nftApproved) {
      calls.push(
        callFromAbi({
          to: source.contractAddress,
          abi: erc721Abi,
          functionName: "approve",
          args: [contracts.ledger, source.tokenId],
        }),
      );
    }

    calls.push(
      callFromAbi({
        to: contracts.ledger,
        abi: DEPOSIT_VENFT_ABI,
        functionName: "depositVeNft",
        args: [config.ledgerVariant, epochs, source.tokenId, account],
      }),
    );
  }

  if (source.kind === "tranche" || source.kind === "venft") {
    const trancheId =
      source.kind === "tranche" ? source.trancheId : deriveTrancheId(family, config.epochs);
    calls.push(
      callFromAbi({
        to: contracts.ledger,
        abi: erc1155Abi,
        functionName: "safeTransferFrom",
        args: [account, contracts.id20, trancheId, amount, "0x"],
      }),
    );
  }

  if (source.kind === "id20" || source.kind === "tranche" || source.kind === "venft") {
    const vaultApproved = await isTokenApprovalSatisfied(ctx, {
      standard: "erc20",
      token: contracts.id20,
      spender: contracts.vault,
      amount,
    });
    if (!vaultApproved) {
      calls.push(
        callFromAbi({
          to: contracts.id20,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.vault, amount],
        }),
      );
    }
    calls.push(
      callFromAbi({
        to: contracts.vault,
        abi: contracts.vaultAbi,
        functionName: "deposit",
        args: [amount, account],
      }),
    );
  }

  return calls;
}

export function makeBridgeVaultConversionStep(params: {
  source: BridgeSource;
  amount: bigint;
  account: Address;
  family: BridgeFamily;
  contracts: BridgeVaultConversionContracts;
  walletClient: WalletClient;
  chain?: Chain;
  label?: string;
}): TxStep | null {
  const { source, amount, account, family, contracts, walletClient } = params;
  if (source.kind === "vault" || source.kind === "peer") return null;

  const config = BRIDGE_FAMILY_CONFIG[family];
  const label = params.label ?? `Convert to ${config.vaultSymbol}`;
  const chain = params.chain ?? walletClient.chain ?? mezoTestnetChain;

  return {
    type: "custom",
    key: "horizon-convert-to-vault-shares",
    label,
    displayLabelBtn: true,
    run: async (ctx) => {
      const lifecycle = createTxNotificationLifecycle(label);
      const meta = await lifecycle.onPending?.({ key: "horizon-convert-to-vault-shares", label, ctx });
      try {
        const calls = await buildBridgeVaultConversionCalls({
          source,
          amount,
          account,
          family,
          contracts,
          ctx,
        });
        if (calls.length === 0) return "skip";

        await lifecycle.onAwaitingWalletConfirmation?.({
          key: "horizon-convert-to-vault-shares",
          label,
          ctx,
          meta,
        });

        const batch = await sendCalls(walletClient, {
          account,
          chain,
          calls: calls.map((call) => ({ to: call.to, data: call.data })),
          // Prefer one wallet confirmation when EIP-5792 is available; otherwise
          // viem sends the calls sequentially with the user as msg.sender.
          experimental_fallback: true,
          forceAtomic: false,
        });

        const status = await waitForCallsStatus(walletClient, {
          id: batch.id,
          throwOnFailure: true,
        });

        const hash = status.receipts?.find((receipt) => receipt.transactionHash)?.transactionHash as
          | `0x${string}`
          | undefined;

        if (hash) {
          await lifecycle.onTransactionSubmitted?.({
            key: "horizon-convert-to-vault-shares",
            label,
            ctx,
            hash,
            meta,
          });
          const matched = status.receipts?.find((item) => item.transactionHash === hash);
          const receipt =
            matched && "status" in matched
              ? (matched as never)
              : await ctx.publicClient.waitForTransactionReceipt({ hash });
          await lifecycle.onTransactionConfirmed?.({
            key: "horizon-convert-to-vault-shares",
            label,
            ctx,
            hash,
            receipt,
            meta,
          });
          return { hash, receipt };
        }

        // Fallback batch ids may encode several hashes; treat success without a
        // single canonical hash as completed once waitForCallsStatus resolves.
        return { hash: batch.id as `0x${string}` };
      } catch (error) {
        await lifecycle.onTransactionFailed?.({
          key: "horizon-convert-to-vault-shares",
          label,
          ctx,
          error,
          message: getParsedError(error),
          meta,
        });
        throw error;
      }
    },
  };
}
