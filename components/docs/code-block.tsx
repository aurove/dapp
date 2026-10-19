"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@ui";

const LANGUAGE_LABELS: Record<string, string> = {
  solidity: "Solidity",
  sol: "Solidity",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  shell: "Shell",
  bash: "Shell",
  sh: "Shell",
  text: "Text",
};

export function CodeBlock({
  code,
  language = "text",
  filename,
  className,
}: {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const label = LANGUAGE_LABELS[language.toLowerCase()] ?? language;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        "group my-5 overflow-hidden rounded-2xl border border-foreground/10 bg-background",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-foreground/8 bg-foreground/[0.03] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-foreground/45">
          <span className="rounded-md border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
            {label}
          </span>
          {filename ? <span className="truncate normal-case tracking-normal text-foreground/55">{filename}</span> : null}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 bg-foreground/5 px-2 py-1 text-[11px] text-foreground/60 transition hover:bg-foreground/10 hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-foreground/85">
        <code className="font-mono">{code.trimEnd()}</code>
      </pre>
    </div>
  );
}
