"use client";

import { LogIn, LogOut, ShieldCheck, LoaderCircle } from "lucide-react";

import { Badge, Button } from "@ui";
import { useWalletAuth } from "@/lib/auth/provider";

export function WalletAuthStatus() {
  const {
    isAuthenticated,
    isAuthenticating,
    loginWithWallet,
    logout,
    walletLabel,
    user,
  } = useWalletAuth();

  if (isAuthenticating) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-100">
          <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
          Signing
        </Badge>
        <Button size="sm" variant="secondary" disabled className="gap-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verifying
        </Button>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Signed in
          </Badge>
          <Button size="sm" variant="secondary" onClick={() => void logout()} className="gap-2">
            <LogOut className="h-3.5 w-3.5" />
            {walletLabel ?? user?.walletAddress}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void loginWithWallet({ force: true })} className="gap-2">
        <LogIn className="h-3.5 w-3.5" />
        Sign In
      </Button>
      <span className="text-[11px] text-white/45">Sign the nonce to unlock the app session.</span>
    </div>
  );
}
