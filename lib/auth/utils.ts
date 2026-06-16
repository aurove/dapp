import { getAddress } from "viem";

import { WALLET_AUTH_STATEMENT } from "./constants";

export function normalizeWalletAddress(address: string): string {
  return getAddress(address).toLowerCase();
}

export function formatWalletAddress(address: string): string {
  return getAddress(address);
}

export function getRequestOrigin(input: Request | { headers: Headers; url?: string }): string {
  const requestUrl = "url" in input ? input.url : undefined;
  if (requestUrl) {
    return new URL(requestUrl).origin;
  }

  const headers = input.headers;
  const forwardedProto = headers.get("x-forwarded-proto");
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = headers.get("host");
  if (!host) {
    return "http://localhost:3000";
  }

  const proto = forwardedProto ?? "http";
  return `${proto}://${host}`;
}

type WalletAuthMessageParams = {
  walletAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  origin: string;
};

export function buildWalletAuthMessage({
  walletAddress,
  chainId,
  nonce,
  issuedAt,
  expirationTime,
  origin,
}: WalletAuthMessageParams): string {
  const domain = new URL(origin).host;
  return [
    `${domain} wants you to sign in with your wallet.`,
    "",
    `Wallet address: ${walletAddress}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
    `URI: ${origin}`,
    "",
    WALLET_AUTH_STATEMENT,
  ].join("\n");
}

const MESSAGE_FIELD_PATTERN = {
  walletAddress: /^Wallet address:\s*(?<value>0x[a-fA-F0-9]{40})$/im,
  chainId: /^Chain ID:\s*(?<value>\d+)$/im,
  nonce: /^Nonce:\s*(?<value>[a-zA-Z0-9]+)$/im,
  issuedAt: /^Issued At:\s*(?<value>.+)$/im,
  expirationTime: /^Expiration Time:\s*(?<value>.+)$/im,
  uri: /^URI:\s*(?<value>.+)$/im,
} as const;

export type ParsedWalletAuthMessage = {
  walletAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  uri: string;
};

export function parseWalletAuthMessage(message: string): ParsedWalletAuthMessage | null {
  const walletAddress = message.match(MESSAGE_FIELD_PATTERN.walletAddress)?.groups?.value;
  const chainIdRaw = message.match(MESSAGE_FIELD_PATTERN.chainId)?.groups?.value;
  const nonce = message.match(MESSAGE_FIELD_PATTERN.nonce)?.groups?.value;
  const issuedAt = message.match(MESSAGE_FIELD_PATTERN.issuedAt)?.groups?.value;
  const expirationTime = message.match(MESSAGE_FIELD_PATTERN.expirationTime)?.groups?.value;
  const uri = message.match(MESSAGE_FIELD_PATTERN.uri)?.groups?.value;

  if (!walletAddress || !chainIdRaw || !nonce || !issuedAt || !expirationTime || !uri) {
    return null;
  }

  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId)) {
    return null;
  }

  return {
    walletAddress,
    chainId,
    nonce,
    issuedAt,
    expirationTime,
    uri,
  };
}

export function shortenWalletAddress(address: string, visibleChars = 4): string {
  const normalized = formatWalletAddress(address);
  return `${normalized.slice(0, 2 + visibleChars)}…${normalized.slice(-visibleChars)}`;
}

