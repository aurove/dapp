import { notify } from "./store";

export function notifyWalletAuthError(title: string, message?: string) {
  return notify.error(title, message);
}

export function notifyWalletAuthInfo(title: string, message?: string) {
  return notify.info(title, message);
}

export function notifyWalletAuthSuccess(title: string, message?: string) {
  return notify.success(title, message);
}

