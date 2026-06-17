import { createAcademyService } from "@/lib/academy/server";
import { getCurrentWalletAuthContextFromCookies } from "@/lib/auth/current";
import type { NextRequest } from "next/server";

export async function getAcademyContext(request: NextRequest) {
  const session = await getCurrentWalletAuthContextFromCookies(request.cookies);
  const service = createAcademyService();

  return {
    service,
    session,
  };
}
