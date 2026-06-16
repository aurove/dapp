import type {
  WalletAuthChallengeResponse,
  WalletAuthSessionResponse,
  WalletAuthVerifyResponse,
} from "./types";

type WalletAuthApiErrorPayload = {
  error?: string;
  code?: string;
};

export class WalletAuthApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "WalletAuthApiError";
    this.status = status;
    this.code = code;
  }
}

async function readErrorMessage(response: Response): Promise<WalletAuthApiErrorPayload> {
  try {
    return (await response.json()) as WalletAuthApiErrorPayload;
  } catch {
    return {};
  }
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await readErrorMessage(response);
    throw new WalletAuthApiError(
      payload.error ?? "Request failed.",
      response.status,
      payload.code,
    );
  }

  return (await response.json()) as T;
}

export async function requestWalletAuthChallenge(input: {
  walletAddress: string;
  chainId: number;
}): Promise<WalletAuthChallengeResponse> {
  return requestJson<WalletAuthChallengeResponse>("/api/auth/nonce", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyWalletAuthSignature(input: {
  walletAddress: string;
  chainId: number;
  message: string;
  signature: `0x${string}`;
}): Promise<WalletAuthVerifyResponse> {
  return requestJson<WalletAuthVerifyResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchWalletAuthSession(input?: {
  walletAddress?: string | null;
  chainId?: number | null;
}): Promise<WalletAuthSessionResponse> {
  const searchParams = new URLSearchParams();
  if (input?.walletAddress) {
    searchParams.set("walletAddress", input.walletAddress);
  }
  if (typeof input?.chainId === "number") {
    searchParams.set("chainId", String(input.chainId));
  }

  const query = searchParams.toString();
  const response = await fetch(`/api/auth/session${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const payload = await readErrorMessage(response);
    throw new WalletAuthApiError(
      payload.error ?? "Session lookup failed.",
      response.status,
      payload.code,
    );
  }

  return (await response.json()) as WalletAuthSessionResponse;
}

export async function logoutWalletAuthSession(): Promise<void> {
  const response = await fetch("/api/auth/session", {
    method: "DELETE",
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const payload = await readErrorMessage(response);
    throw new WalletAuthApiError(
      payload.error ?? "Logout failed.",
      response.status,
      payload.code,
    );
  }
}
