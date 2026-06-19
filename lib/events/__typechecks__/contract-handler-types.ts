import { buildHandlerKey, registerContractEventHandler } from "../handlers";

void buildHandlerKey("Marketplace", "OrdersMatched");

// @ts-expect-error PositionDeposited does not belong to Marketplace.
void buildHandlerKey("Marketplace", "PositionDeposited");

void registerContractEventHandler({
  key: buildHandlerKey("Marketplace", "OrdersMatched"),
  description: "Compile-time contract/event typing check.",
  contractName: "Marketplace",
  // @ts-expect-error PositionDeposited does not belong to Marketplace.
  eventName: "PositionDeposited",
  run(_ctx, event) {
    void event.namedArgs.listingId;
    void event.namedArgs.bidId;
    void event.namedArgs.collection;
    return null;
  },
});

export {};
