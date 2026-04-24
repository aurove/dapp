"use client";

import { create } from "zustand";

export type NotifyType = "info" | "pending" | "success" | "error";

export type NotifyAction =
  | { label: string; onClick?: () => void }
  | { label: string; href: string; external?: boolean };

export type NotifyItem = {
  id: string;
  type: NotifyType;
  title: string;
  message?: string;
  createdAt: number;
  txHash?: `0x${string}`;
  chainId?: number;
  dismissAfterMs?: number;
  persistent?: boolean;
  action?: NotifyAction;
};

type NotifyState = {
  items: NotifyItem[];
  push: (item: Omit<NotifyItem, "id" | "createdAt"> & { id?: string }) => string;
  update: (id: string, patch: Partial<NotifyItem>) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const defaultsByType: Record<NotifyType, { dismissAfterMs?: number; persistent?: boolean }> = {
  info: { dismissAfterMs: 5000 },
  pending: { persistent: true },
  success: { dismissAfterMs: 7000 },
  error: { dismissAfterMs: 9000 },
};

function makeNotifyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 10);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const useNotifyStore = create<NotifyState>((set) => ({
  items: [],
  push: (item) => {
    const id = item.id ?? makeNotifyId();
    const createdAt = Date.now();

    set((state) => ({
      items: [{ id, createdAt, ...item }, ...state.items],
    }));

    return id;
  },
  update: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  remove: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  clear: () => set({ items: [] }),
}));

export const notify = {
  push: (item: Omit<NotifyItem, "id" | "createdAt"> & { id?: string }) => {
    const typeDefaults = defaultsByType[item.type];
    return useNotifyStore.getState().push({
      ...typeDefaults,
      ...item,
      dismissAfterMs: item.dismissAfterMs ?? typeDefaults.dismissAfterMs,
      persistent: item.persistent ?? typeDefaults.persistent,
    });
  },

  update: (id: string, patch: Partial<NotifyItem>) => useNotifyStore.getState().update(id, patch),
  remove: (id: string) => useNotifyStore.getState().remove(id),
  clear: () => useNotifyStore.getState().clear(),

  info: (title: string, message?: string) => notify.push({ type: "info", title, message }),
  success: (title: string, message?: string) => notify.push({ type: "success", title, message }),
  error: (title: string, message?: string) => notify.push({ type: "error", title, message }),

  pendingTx: (title: string, message?: string, meta?: { chainId?: number }) =>
    notify.push({ type: "pending", title, message, chainId: meta?.chainId }),

  txSent: (id: string, hash: `0x${string}`) =>
    notify.update(id, { txHash: hash, message: "Transaction submitted." }),

  txConfirmed: (id: string, message = "Transaction confirmed.") =>
    notify.update(id, { type: "success", persistent: false, dismissAfterMs: 7000, message }),

  txFailed: (id: string, message = "Transaction failed.") =>
    notify.update(id, { type: "error", persistent: false, dismissAfterMs: 9000, message }),
};
