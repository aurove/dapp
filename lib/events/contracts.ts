import "server-only";

import contractsRegistry from "@/contracts/registry";
import type { ContractAbi } from "@/contracts/types";
import { getAddress, isAddress } from "viem";

import type { RegisteredContract } from "./types";

const runtimeContracts = new Map<string, RegisteredContract>();
const staticContracts = buildStaticContractRegistry();

function normalizeAddress(value: string): string | null {
  if (!isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

function makeContractKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

export function getContractEventNames(abi: ContractAbi): string[] {
  const names = new Set<string>();

  for (const entry of abi) {
    if (entry.type === "event" && typeof entry.name === "string" && entry.name.trim().length > 0) {
      names.add(entry.name.trim());
    }
  }

  return Array.from(names);
}

function toRegisteredContract(
  chainId: number,
  contractName: string,
  contract: { address?: string; abi: ContractAbi; deploymentBlock?: number },
  source: RegisteredContract["source"],
): RegisteredContract | null {
  if (!contract.address) {
    return null;
  }

  const address = normalizeAddress(contract.address);
  if (!address) {
    return null;
  }

  return {
    chainId,
    address,
    contractName: contractName as RegisteredContract["contractName"],
    abi: contract.abi,
    deploymentBlock: Number.isInteger(contract.deploymentBlock) ? contract.deploymentBlock : null,
    source,
  };
}

function buildStaticContractRegistry(): Map<string, RegisteredContract> {
  const registry = new Map<string, RegisteredContract>();

  for (const [chainIdKey, chainContracts] of Object.entries(contractsRegistry)) {
    const chainId = Number(chainIdKey);
    if (!Number.isInteger(chainId)) {
      continue;
    }

    for (const [contractName, contract] of Object.entries(chainContracts)) {
      const resolved = toRegisteredContract(chainId, contractName, contract, "static");
      if (!resolved) {
        continue;
      }

      registry.set(makeContractKey(chainId, resolved.address), resolved);
    }
  }

  return registry;
}

export function registerRuntimeContract(contract: RegisteredContract): RegisteredContract {
  const normalizedAddress = normalizeAddress(contract.address);
  if (!normalizedAddress) {
    throw new Error(`Invalid contract address: ${contract.address}`);
  }

  const deploymentBlock =
    contract.deploymentBlock == null
      ? null
      : Number.isInteger(contract.deploymentBlock) && contract.deploymentBlock >= 0
        ? contract.deploymentBlock
        : null;

  const normalized: RegisteredContract = {
    ...contract,
    address: normalizedAddress,
    source: contract.source ?? "runtime",
    deploymentBlock,
  };

  runtimeContracts.set(makeContractKey(normalized.chainId, normalized.address), normalized);
  return normalized;
}

export function getRegisteredContract(chainId: number, address: string): RegisteredContract | null {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  const key = makeContractKey(chainId, normalizedAddress);
  return runtimeContracts.get(key) ?? staticContracts.get(key) ?? null;
}

export function hasRegisteredContractAbi(chainId: number, address: string): boolean {
  return getRegisteredContract(chainId, address) !== null;
}
