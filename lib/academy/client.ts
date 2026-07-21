import type {
  AcademyActivityPage,
  AcademyLeaderboardPage,
  AcademyReferralActionResponse,
  AcademySummary,
} from "./types";

type AcademyApiErrorPayload = {
  error?: string;
  code?: string;
};

export class AcademyApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AcademyApiError";
    this.status = status;
    this.code = code;
  }
}

async function readErrorMessage(response: Response): Promise<AcademyApiErrorPayload> {
  try {
    return (await response.json()) as AcademyApiErrorPayload;
  } catch {
    return {};
  }
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit): Promise<T> {
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
    const message = response.status >= 500 ? "Request failed." : payload.error ?? "Request failed.";
    throw new AcademyApiError(message, response.status, payload.code);
  }

  return (await response.json()) as T;
}

export async function requestAcademySummary(): Promise<AcademySummary> {
  return requestJson<AcademySummary>("/api/academy/summary", { method: "GET" });
}

export async function requestAcademyLeaderboard(input: {
  page: number;
  limit: number;
}): Promise<AcademyLeaderboardPage> {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    limit: String(input.limit),
  });

  return requestJson<AcademyLeaderboardPage>(`/api/academy/leaderboard?${searchParams.toString()}`, {
    method: "GET",
  });
}

export async function requestAcademyActivity(input: {
  address: string;
  seasonId?: string | null;
  page: number;
  limit: number;
}): Promise<AcademyActivityPage> {
  const searchParams = new URLSearchParams({
    address: input.address,
    page: String(input.page),
    limit: String(input.limit),
  });

  if (input.seasonId) {
    searchParams.set("seasonId", input.seasonId);
  }

  return requestJson<AcademyActivityPage>(`/api/academy/activity?${searchParams.toString()}`, {
    method: "GET",
  });
}

export async function requestAcademyReferral(input: {
  refId: string;
}): Promise<AcademyReferralActionResponse> {
  return requestJson<AcademyReferralActionResponse>("/api/academy/referral", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
