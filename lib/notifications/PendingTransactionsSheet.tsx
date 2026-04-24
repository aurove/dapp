"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock3, ExternalLink, History, Loader2, XCircle } from "lucide-react";
import { Button } from "@fractals/ui/ui/button";
import { ScrollArea } from "@fractals/ui/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@fractals/ui/ui/sheet";
import { useNotifyStore } from "./store";
import { getExplorerTxUrl } from "./urls";

function statusIcon(type: "pending" | "success" | "error" | "info") {
  if (type === "pending") {
    return <Loader2 className="h-4 w-4 animate-spin text-sky-300" />;
  }
  if (type === "error") {
    return <XCircle className="h-4 w-4 text-red-300" />;
  }
  if (type === "success") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  }
  return <Clock3 className="h-4 w-4 text-emerald-300" />;
}

export function PendingTransactionsSheet() {
  const records = useNotifyStore((state) => state.items);
  const remove = useNotifyStore((state) => state.remove);
  const pendingCount = records.filter((record) => record.type === "pending").length;

  const clearCompleted = () => {
    for (const record of records) {
      if (record.type !== "pending") {
        remove(record.id);
      }
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2">
          <History className="h-4 w-4" />
          Transactions
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{pendingCount}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(92vw,460px)]">
        <SheetHeader>
          <SheetTitle>Transaction Center</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex items-center justify-between text-xs text-white/50">
          <p>
            Pending: {pendingCount} • Total this session: {records.length}
          </p>
          <Button variant="ghost" size="sm" onClick={clearCompleted}>
            Clear Done
          </Button>
        </div>
        <ScrollArea className="mt-4 h-[calc(100vh-12rem)] pr-3">
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {records.map((record) => {
                const txUrl = record.txHash
                  ? getExplorerTxUrl(record.chainId, record.txHash)
                  : null;
                return (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-white">{record.title}</p>
                        {record.message ? (
                          <p className="text-xs text-white/55">{record.message}</p>
                        ) : null}
                      </div>
                      {statusIcon(record.type)}
                    </div>
                    {txUrl ? (
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
                      >
                        View on explorer
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {records.length === 0 ? (
              <p className="text-sm text-white/55">No transactions yet.</p>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
