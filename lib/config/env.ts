import { resolveAppEnvironment, type AppEnvironment } from "./chains";

export type RuntimeConfig = {
  environment: AppEnvironment;
  walletConnectProjectId: string;
  passport: {
    enabled: boolean;
    environment: "testnet" | "mainnet";
  };
  explorerBaseUrl: string | null;
  trading: {
    veBtcAddress: string | null;
    veMezoAddress: string | null;
    defaultPaymentTokenAddress: string | null;
  };
};

export function getRuntimeConfig(): RuntimeConfig {
  const environment = resolveAppEnvironment();
  const walletConnectProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "1d704aa13ff6d856e2935a85987c34ec";
  const passportEnabled =
    (process.env.NEXT_PUBLIC_PASSPORT_ENABLED || "false").toLowerCase() === "true";
  const passportEnvironment =
    process.env.NEXT_PUBLIC_PASSPORT_ENVIRONMENT === "mainnet" ? "mainnet" : "testnet";

  return {
    environment,
    walletConnectProjectId,
    passport: {
      enabled: passportEnabled,
      environment: passportEnvironment,
    },
    explorerBaseUrl: process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || null,
    trading: {
      veBtcAddress: process.env.NEXT_PUBLIC_VEBTC_ADDRESS || null,
      veMezoAddress: process.env.NEXT_PUBLIC_VEMEZO_ADDRESS || null,
      defaultPaymentTokenAddress: process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_TOKEN_ADDRESS || null,
    },
  };
}
