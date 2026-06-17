import { NextResponse, type NextRequest } from "next/server";

export function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return `ip:${realIp}`;
  }

  return "ip:unknown";
}

export function createNoStoreJsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "cache-control": "no-store",
      pragma: "no-cache",
      expires: "0",
      ...(init?.headers ?? {}),
    },
  });
}

export function createNoStoreErrorResponse(
  message: string,
  status = 400,
  code?: string,
) {
  return createNoStoreJsonResponse({ error: message, code }, { status });
}

export function logServerError(context: string, error: unknown, details?: Record<string, unknown>) {
  if (details) {
    console.error(`[${context}]`, error, details);
    return;
  }

  console.error(`[${context}]`, error);
}

export function createNoStoreInternalErrorResponse(
  context: string,
  error: unknown,
  options?: {
    message?: string;
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
  },
) {
  logServerError(context, error, options?.details);
  return createNoStoreErrorResponse(
    options?.message ?? "An unexpected error occurred.",
    options?.status ?? 500,
    options?.code ?? "INTERNAL_SERVER_ERROR",
  );
}

export function withNoStoreRouteErrorHandling<TArgs extends unknown[]>(
  context: string,
  handler: (...args: TArgs) => Promise<Response> | Response,
  options?: {
    message?: string;
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
  },
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return createNoStoreInternalErrorResponse(context, error, options);
    }
  };
}

export function parsePositiveInteger(value: string | null): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
