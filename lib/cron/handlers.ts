import type { CronHandlerContext, CronHandlerDefinition } from "./types";

async function syncContractEventsPlaceholder(_ctx: CronHandlerContext) {
  // TODO: connect this to the contract event sync pipeline.
  // Keep this handler idempotent and checkpointed so retries do not duplicate work.
  return {
    todo: true,
    message: "Placeholder handler. Implement contract event syncing here.",
  };
}

export const cronHandlers = [
  {
    key: "syncContractEvents",
    intervalSeconds: 60,
    enabled: false,
    run: syncContractEventsPlaceholder,
  },
] as const satisfies readonly CronHandlerDefinition[];

export type CronHandlerKey = (typeof cronHandlers)[number]["key"];
