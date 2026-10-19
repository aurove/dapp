import { resolveAppEnvironment, type AppEnvironment } from "@/lib/config/chains";

export type AppTheme = "light" | "dark";

/** Mainnet builds render dark; local and testnet render light. */
export function resolveAppTheme(environment: AppEnvironment = resolveAppEnvironment()): AppTheme {
  return environment === "mainnet" ? "dark" : "light";
}

export function themeColorFor(theme: AppTheme): string {
  return theme === "dark" ? "#0a0f15" : "#f4efe6";
}
