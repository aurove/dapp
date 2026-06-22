"use client";

import { useEffect } from "react";
import { RouteFallback } from "@/components/site/route-fallback";

type AppErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function Error({ error, unstable_retry }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <RouteFallback
      variant="error"
      eyebrow="Rendering issue"
      title="We hit a temporary break in the flow."
      description="Something in this route failed to render cleanly. You can return home to keep moving, or try loading this view again if you were in the middle of a session."
      primaryLabel="Back to home"
      primaryHref="/"
      secondaryLabel="Try again"
      onSecondaryAction={unstable_retry}
      note={
        error.digest
          ? `Reference ${error.digest}. If this keeps happening, share that code with the team so we can trace it quickly.`
          : "If this keeps happening, return home and retry the flow once the page has settled."
      }
    />
  );
}
