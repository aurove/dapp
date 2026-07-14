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
  protocol: {
    ledgerAddress: string | null;
    vaultAddress: string | null;
    id20FactoryAddress: string | null;
  };
};

function requireWalletConnectProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      [
        "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.",
        "",
        "Bitget Wallet mobile connections require WalletConnect/Reown. Create a project ID at https://cloud.walletconnect.com and set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your deployment environment, such as Vercel Project Settings -> Environment Variables.",
      ].join("\n"),
    );
  }

  return projectId;
}

export function getRuntimeConfig(): RuntimeConfig {
  const environment = resolveAppEnvironment();
  const walletConnectProjectId = requireWalletConnectProjectId();
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
    protocol: {
      ledgerAddress: process.env.NEXT_PUBLIC_LEDGER_ADDRESS || null,
      vaultAddress: process.env.NEXT_PUBLIC_VAULT_ADDRESS || null,
      id20FactoryAddress: process.env.NEXT_PUBLIC_ID20_FACTORY_ADDRESS || null,
    },
  };
}
