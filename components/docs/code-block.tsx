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
        "group my-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e14]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-white/45">
          <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-[#ecd09b]/90">
            {label}
          </span>
          {filename ? <span className="truncate normal-case tracking-normal text-white/55">{filename}</span> : null}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-[#e8e2d8]">
        <code className="font-mono">{code.trimEnd()}</code>
      </pre>
    </div>
  );
}
