import { buildHandlerKey, registerContractEventHandler } from "../handlers";

void buildHandlerKey("Ledger", "RebaseClaimed");

// @ts-expect-error PositionDeposited does not belong to Ledger.
void buildHandlerKey("Ledger", "PositionDeposited");

void registerContractEventHandler({
  key: buildHandlerKey("Ledger", "RebaseClaimed"),
  description: "Compile-time contract/event typing check.",
  contractName: "Ledger",
  // @ts-expect-error PositionDeposited does not belong to Ledger.
  eventName: "PositionDeposited",
  run(_ctx, event) {
    void event.namedArgs.manager;
    void event.namedArgs.trancheId;
    void event.namedArgs.amount;
    return null;
  },
});

export {};
