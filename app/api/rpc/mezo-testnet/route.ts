import { NextRequest, NextResponse } from "next/server";
import { consumeRpcRateLimit } from "@/lib/server/rpc-rate-limit";
import { RPC_SESSION_COOKIE_NAME, verifyRpcSessionToken } from "@/lib/server/rpc-session";

export const runtime = "nodejs";

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp}`;
  return "ip:unknown";
}

function getSpectrumEndpoint(): string {
  const endpoint = process.env.SPECTRUM_MEZO_TESTNET_RPC_HTTP;
  if (!endpoint || endpoint.trim().length === 0) {
    throw new Error("SPECTRUM_MEZO_TESTNET_RPC_HTTP is not configured.");
  }
  return endpoint;
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(RPC_SESSION_COOKIE_NAME)?.value;
  if (!verifyRpcSessionToken(sessionToken)) {
    return NextResponse.json({ error: "Unauthorized RPC session." }, { status: 401 });
  }

  const rateCheck = consumeRpcRateLimit(getClientKey(request));
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "RPC rate limit exceeded." },
      {
        status: 429,
        headers: {
          "retry-after": String(rateCheck.retryAfterSeconds),
        },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const upstream = await fetch(getSpectrumEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const responseText = await upstream.text();
    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC proxy failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
