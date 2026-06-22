"use client";

import { useEffect } from "react";
import { RouteFallback } from "@/components/site/route-fallback";
import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <RouteFallback
          variant="error"
          eyebrow="Global error"
          title="Aurove lost the thread for a moment."
          description="The app shell failed before the route could fully recover. Returning home will reset the path, and you can retry once the app is back in view."
          primaryLabel="Back to home"
          primaryHref="/"
          secondaryLabel="Try again"
          onSecondaryAction={unstable_retry}
          note={
            error.digest
              ? `Reference ${error.digest}. That is the quickest way for us to trace the failure in production.`
              : "If the issue persists, come back through the home page and try the route again."
          }
        />
      </body>
    </html>
  );
}
