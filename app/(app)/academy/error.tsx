"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui";

type AcademyErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function AcademyError({ error, unstable_retry }: AcademyErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8">
      <Card className="w-full max-w-2xl border-white/10 bg-white/[0.03]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-rose-100">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-[0.2em]">Academy unavailable</span>
          </div>
          <CardTitle className="text-3xl text-white">We hit a rendering problem</CardTitle>
          <CardDescription className="text-base leading-7">
            The Academy route failed to render cleanly. You can try again now, and if the issue persists
            we should inspect the latest server logs or browser console output.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/55">
            A temporary error prevented the Academy view from loading. Please try again in a moment.
          </p>
          <Button type="button" className="gap-2" onClick={unstable_retry}>
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
