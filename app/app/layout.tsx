import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Web3Providers } from "@/lib/providers/web3-providers";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Web3Providers>
      <AppShell>{children}</AppShell>
    </Web3Providers>
  );
}
