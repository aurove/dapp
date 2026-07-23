"use client";

import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { requestAcademyActivity } from "@/lib/academy/client";
import { DEFAULT_ACADEMY_ACTIVITY_PAGE_SIZE } from "@/lib/academy/constants";

const academyActivityQueryKeys = {
  activity: (seasonId: string | null, walletAddress: string, page: number, limit: number) =>
    ["academy", "activity", seasonId ?? "current", walletAddress, page, limit] as const,
};

const ACADEMY_ACTIVITY_QUERY_STALE_TIME_MS = 5 * 60 * 1000;
const ACADEMY_ACTIVITY_QUERY_GC_TIME_MS = 15 * 60 * 1000;

function buildActivityUrl(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function clearActivityParams(searchParams: URLSearchParams): URLSearchParams {
  searchParams.delete("address");
  searchParams.delete("activityPage");
  return searchParams;
}

function parsePositiveInteger(value: string | null): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function useAcademyActivity(seasonId: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const activityAddress = searchParams.get("address");
  const activityPage = parsePositiveInteger(searchParams.get("activityPage")) ?? 1;
  const activityLimit = DEFAULT_ACADEMY_ACTIVITY_PAGE_SIZE;

  const activityQueryKey = useMemo(() => {
    if (!activityAddress) {
      return academyActivityQueryKeys.activity(seasonId, "idle", activityPage, activityLimit);
    }

    return academyActivityQueryKeys.activity(seasonId, activityAddress, activityPage, activityLimit);
  }, [activityAddress, activityLimit, activityPage, seasonId]);

  const activityQuery = useQuery({
    queryKey: activityQueryKey,
    queryFn: () =>
      requestAcademyActivity({
        address: activityAddress ?? "",
        seasonId,
        page: activityPage,
        limit: activityLimit,
      }),
    enabled: Boolean(activityAddress),
    staleTime: ACADEMY_ACTIVITY_QUERY_STALE_TIME_MS,
    gcTime: ACADEMY_ACTIVITY_QUERY_GC_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const openActivityLog = useCallback(
    (walletAddress: string) => {
      if (!walletAddress) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set("address", walletAddress);
      params.set("activityPage", "1");
      router.push(buildActivityUrl(pathname, params), { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeActivityLog = useCallback(() => {
    const params = clearActivityParams(new URLSearchParams(searchParams.toString()));
    router.replace(buildActivityUrl(pathname, params), { scroll: false });
  }, [pathname, router, searchParams]);

  const setActivityPage = useCallback(
    (page: number) => {
      if (!activityAddress) return;

      const nextPage = Number.isInteger(page) && page > 0 ? page : 1;
      const params = new URLSearchParams(searchParams.toString());
      params.set("address", activityAddress ?? "");
      params.set("activityPage", String(nextPage));
      router.replace(buildActivityUrl(pathname, params), { scroll: false });
    },
    [activityAddress, pathname, router, searchParams],
  );

  const prefetchActivityLog = useCallback(
    (walletAddress: string) => {
      if (!walletAddress) return;

      void queryClient.prefetchQuery({
        queryKey: academyActivityQueryKeys.activity(seasonId, walletAddress, 1, activityLimit),
        queryFn: () =>
          requestAcademyActivity({
            address: walletAddress,
            seasonId,
            page: 1,
            limit: activityLimit,
          }),
        staleTime: ACADEMY_ACTIVITY_QUERY_STALE_TIME_MS,
      });
    },
    [activityLimit, queryClient, seasonId],
  );

  return {
    activityAddress,
    activityPage,
    activityLimit,
    activityQuery,
    isOpen: Boolean(activityAddress),
    openActivityLog,
    closeActivityLog,
    setActivityPage,
    prefetchActivityLog,
  };
}
