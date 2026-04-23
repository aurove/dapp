import { TxContractsDeclaration } from "./types";

export function defineTxContracts<T extends TxContractsDeclaration>(contracts: T): T {
  return contracts;
}
