"use client";

import * as React from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@fractals/ui/ui/button";
import { getExplorerTxUrl, shortHash } from "./urls";
import { useNotifyStore } from "./store";

function typeStyles(type: string) {
  switch (type) {
    case "pending":
      return {
        badge: "border-amber-400/40 bg-amber-400/15 text-amber-100",
        bar: "bg-amber-300",
      };
    case "success":
      return {
        badge: "border-emerald-400/40 bg-emerald-400/15 text-emerald-100",
        bar: "bg-emerald-300",
      };
    case "error":
      return {
        badge: "border-red-400/40 bg-red-400/15 text-red-100",
        bar: "bg-red-300",
      };
    default:
      return {
        badge: "border-sky-400/40 bg-sky-400/15 text-sky-100",
        bar: "bg-sky-300",
      };
  }
}

export function NotificationsToaster() {
  const items = useNotifyStore((state) => state.items);
  const remove = useNotifyStore((state) => state.remove);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3"
      aria-live="polite"
      aria-atomic="true"
    >
      {items.map((item) => (
        <Toast key={item.id} id={item.id} onClose={() => remove(item.id)} />
      ))}
    </div>
  );
}

function Toast({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useNotifyStore((state) => state.items.find((entry) => entry.id === id));
  const [hovered, setHovered] = React.useState(false);
  const dismissAfterMs = item?.dismissAfterMs ?? 0;
  const remainingRef = React.useRef(dismissAfterMs);
  const [remainingMs, setRemainingMs] = React.useState(dismissAfterMs);

  React.useEffect(() => {
    if (!item || item.persistent || dismissAfterMs <= 0 || hovered) {
      return;
    }

    const startedAt = Date.now();
    const timeout = window.setTimeout(onClose, remainingRef.current);
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, remainingRef.current - elapsed);
      setRemainingMs(next);
    }, 50);

    return () => {
      const elapsed = Date.now() - startedAt;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      setRemainingMs(remainingRef.current);
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [dismissAfterMs, hovered, item, onClose]);

  if (!item) {
    return null;
  }

  const txUrl = item.txHash ? getExplorerTxUrl(item.chainId, item.txHash) : null;
  const styles = typeStyles(item.type);
  const progressPercent =
    dismissAfterMs > 0 ? Math.max(0, (remainingMs / dismissAfterMs) * 100) : 0;

  return (
    <div
      role="status"
      className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-[#0b1118]/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${styles.badge}`}
        >
          {item.type}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{item.title}</p>
          {item.message ? <p className="mt-1 text-xs text-white/65">{item.message}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {item.txHash ? (
              txUrl ? (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-xs text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  View tx {shortHash(item.txHash)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="rounded-lg border border-white/20 px-2 py-1 text-xs text-white/65">
                  Tx {shortHash(item.txHash)}
                </span>
              )
            ) : null}

            {item.action ? (
              "href" in item.action ? (
                <a
                  href={item.action.href}
                  target={item.action.external ? "_blank" : undefined}
                  rel={item.action.external ? "noreferrer" : undefined}
                  className="inline-flex items-center rounded-lg border border-white/20 px-2 py-1 text-xs text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  {item.action.label}
                </a>
              ) : (
                <Button variant="secondary" size="sm" onClick={item.action.onClick}>
                  {item.action.label}
                </Button>
              )
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Close notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!item.persistent && dismissAfterMs > 0 ? (
        <div className="h-1 w-full bg-white/5">
          <div
            className={`h-full transition-[width] duration-75 ease-linear ${styles.bar}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default NotificationsToaster;
