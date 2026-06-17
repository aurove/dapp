import type { AcademyLeaderboardEntry } from "./types";

type LabelInput = string | null | undefined;

export function formatPoints(value: number | bigint | string): string {
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(numeric);
}

function wordsFromLabel(input: LabelInput): string[] {
  if (!input) {
    return [];
  }

  return input
    .replaceAll(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function titleCase(input: LabelInput): string {
  const words = wordsFromLabel(input);
  if (words.length === 0) {
    return "Unknown";
  }

  return words
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function buildUserIdentity(input: {
  walletAddress: string;
  displayName?: string | null;
}): string {
  return input.displayName?.trim() || input.walletAddress;
}

export function buildLeaderboardIdentity(entry: Pick<AcademyLeaderboardEntry, "displayName" | "walletAddress">): string {
  return entry.displayName?.trim() || entry.walletAddress;
}
