import type { TxFlowRuntimeContext, TxWriteLifecycleHooks } from "../tx-flow/types";
import { notify } from "./store";

function resolveNotificationId(meta: unknown): string | null {
  return typeof meta === "string" && meta.length > 0 ? meta : null;
}

export function createTxNotificationLifecycle(label: string): TxWriteLifecycleHooks {
  return {
    onPending: ({ ctx }: { ctx: TxFlowRuntimeContext }) =>
      notify.pendingTx(label, "Waiting for wallet confirmation…", { chainId: ctx.chainId }),
    onAwaitingWalletConfirmation: ({ meta }) => {
      const id = resolveNotificationId(meta);
      if (id) {
        notify.update(id, { message: "Confirm in wallet…" });
      }
    },
    onTransactionSubmitted: ({ meta, hash }) => {
      const id = resolveNotificationId(meta);
      if (id) {
        notify.txSent(id, hash);
      }
    },
    onTransactionConfirmed: ({ meta }) => {
      const id = resolveNotificationId(meta);
      if (id) {
        notify.txConfirmed(id);
      }
    },
    onTransactionFailed: ({ meta, message }) => {
      const id = resolveNotificationId(meta);
      if (id) {
        notify.txFailed(id, message);
      }
    },
  };
}
