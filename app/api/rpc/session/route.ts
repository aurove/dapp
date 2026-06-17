import { NextResponse } from "next/server";
import {
  createRpcSessionToken,
  getRpcSessionTtlSeconds,
  RPC_SESSION_COOKIE_NAME,
} from "@/lib/server/rpc-session";
import { withNoStoreRouteErrorHandling } from "@/lib/server/http";

export const runtime = "nodejs";

async function postRpcSession() {
  const token = createRpcSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: RPC_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getRpcSessionTtlSeconds(),
  });
  return response;
}

export const POST = withNoStoreRouteErrorHandling("rpc/session", postRpcSession, {
  message: "Unable to issue RPC session.",
  status: 500,
  code: "RPC_SESSION_FAILED",
});
