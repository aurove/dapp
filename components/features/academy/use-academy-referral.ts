"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { requestAcademyReferral } from "@/lib/academy/client";
import { useWalletAuth } from "@/lib/auth/provider";

function buildUrl(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function stripReferralParams(searchParams: URLSearchParams): URLSearchParams {
  searchParams.delete("ref");
  searchParams.delete("chainId");
  return searchParams;
}

export function useAcademyReferral() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useWalletAuth();
  const handledKeyRef = useRef<string | null>(null);

  const refId = searchParams.get("ref");

  useEffect(() => {
    if (!refId) {
      handledKeyRef.current = null;
      return;
    }

    const handledKey = `${refId}:${isAuthenticated ? "auth" : "guest"}`;
    if (handledKeyRef.current === handledKey) {
      return;
    }

    handledKeyRef.current = handledKey;

    void (async () => {
      try {
        const result = await requestAcademyReferral({ refId });

        if (result.status === "bound") {
          await queryClient.invalidateQueries({ queryKey: ["academy", "summary"] });
        }
      } catch {
        // Invalid or stale referral links should not block the page.
      } finally {
        const params = stripReferralParams(new URLSearchParams(searchParams.toString()));
        router.replace(buildUrl(pathname, params), { scroll: false });
      }
    })();
  }, [isAuthenticated, pathname, queryClient, refId, router, searchParams]);
}
