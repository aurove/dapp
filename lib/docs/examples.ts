import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { getEarnProtocolAddresses, getId20FactoryAbi, getLedgerAbi } from "@/contracts/earn";
import { mezoMainnetChain } from "@/lib/config/chains";
import { DEPLOYMENT_BY_ID, MEZO_CHAIN_ID, TRANCHE_PRODUCTS } from "@/lib/docs/contracts-reference";

const AVBTCM_TRANCHE_ID = TRANCHE_PRODUCTS[0].trancheId;
const AVMEZOM_TRANCHE_ID = TRANCHE_PRODUCTS[1].trancheId;

export const DOCS_EXAMPLE_CHAIN_ID = MEZO_CHAIN_ID;

export function docsExampleAddresses() {
  const { ledgerAddress, id20FactoryAddress, auroveId20Address, mezoAuroveId20Address } =
    getEarnProtocolAddresses(MEZO_CHAIN_ID);
  return {
    ledger: getAddress(ledgerAddress ?? DEPLOYMENT_BY_ID.ledger.address),
    id20Factory: getAddress(id20FactoryAddress ?? DEPLOYMENT_BY_ID["id20-factory"].address),
    avBtcId20: getAddress(auroveId20Address ?? DEPLOYMENT_BY_ID.avbtcm.address),
    avMezoId20: getAddress(mezoAuroveId20Address ?? DEPLOYMENT_BY_ID.avmezom.address),
  };
}

export function docsExamplePublicClient() {
  return createPublicClient({
    chain: mezoMainnetChain,
    transport: http(mezoMainnetChain.rpcUrls.default.http[0]),
  });
}

/** Read-only: resolve deployed ID20 wrappers from the factory. */
export async function readCanonicalId20Addresses() {
  const client = docsExamplePublicClient();
  const factory = docsExampleAddresses().id20Factory;
  const abi = getId20FactoryAbi(MEZO_CHAIN_ID);
  if (!abi) throw new Error("Id20Factory ABI is not available for Mezo mainnet.");

  const [avBtc, avMezo] = await Promise.all([
    client.readContract({
      address: factory,
      abi,
      functionName: "getId20",
      args: [BigInt(AVBTCM_TRANCHE_ID)],
    }),
    client.readContract({
      address: factory,
      abi,
      functionName: "getId20",
      args: [BigInt(AVMEZOM_TRANCHE_ID)],
    }),
  ]);

  return {
    avBTCm: getAddress(avBtc as Address),
    avMEZOm: getAddress(avMezo as Address),
  };
}

/** Read-only: ERC-1155 supply for both production tranches. */
export async function readTrancheSupplies() {
  const client = docsExamplePublicClient();
  const ledger = docsExampleAddresses().ledger;
  const abi = getLedgerAbi(MEZO_CHAIN_ID);
  if (!abi) throw new Error("Ledger ABI is not available for Mezo mainnet.");

  const [avBtcSupply, avMezoSupply] = await Promise.all([
    client.readContract({
      address: ledger,
      abi,
      functionName: "totalSupply",
      args: [BigInt(AVBTCM_TRANCHE_ID)],
    }),
    client.readContract({
      address: ledger,
      abi,
      functionName: "totalSupply",
      args: [BigInt(AVMEZOM_TRANCHE_ID)],
    }),
  ]);

  return {
    avBTCm: avBtcSupply as bigint,
    avMEZOm: avMezoSupply as bigint,
  };
}

/**
 * Safe calldata shape for Ledger.depositErc20. The dApp currently always passes
 * the managed sentinel as `epochs`; the Ledger ignores the value and mints the
 * managed tranche. Do not treat this as a public admin path.
 */
export function depositErc20CalldataArgs(input: {
  variant: 1 | 2;
  amount: bigint;
  receiver: Address;
}): readonly [number, bigint, bigint, Address] {
  const epochs = input.variant === 1 ? 4n : 208n;
  return [input.variant, epochs, input.amount, input.receiver];
}

export function wrapTrancheTransferData(recipient?: Address): Hex {
  return recipient ? (`0x${recipient.slice(2).padStart(64, "0")}` as Hex) : "0x";
}
