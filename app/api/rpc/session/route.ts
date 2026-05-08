import { NextResponse } from "next/server";
import {
  createRpcSessionToken,
  getRpcSessionTtlSeconds,
  RPC_SESSION_COOKIE_NAME,
} from "@/lib/server/rpc-session";

export const runtime = "nodejs";

export async function POST() {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to issue RPC session.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
