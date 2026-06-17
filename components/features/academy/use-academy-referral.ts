"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { requestAcademyReferral } from "@/lib/academy/client";
import { useWalletAuth } from "@/lib/auth/provider";

function parsePositiveInteger(value: string | null): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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
  const { chainId, isAuthenticated } = useWalletAuth();
  const handledKeyRef = useRef<string | null>(null);

  const refId = searchParams.get("ref");
  const referralChainId = parsePositiveInteger(searchParams.get("chainId"));

  useEffect(() => {
    if (!refId) {
      handledKeyRef.current = null;
      return;
    }

    const handledKey = `${refId}:${referralChainId ?? "none"}:${isAuthenticated ? "auth" : "guest"}:${chainId ?? "none"}`;
    if (handledKeyRef.current === handledKey) {
      return;
    }

    handledKeyRef.current = handledKey;

    const nextChainId = referralChainId ?? chainId;
    void (async () => {
      try {
        const result = await requestAcademyReferral({
          refId,
          chainId: nextChainId,
        });

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
  }, [chainId, isAuthenticated, pathname, queryClient, refId, referralChainId, router, searchParams]);
}
