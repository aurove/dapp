"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui";
import { cn } from "@ui";

export type DocsTabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

export function DocsTabs({
  tabs,
  defaultValue,
  className,
}: {
  tabs: DocsTabItem[];
  defaultValue?: string;
  className?: string;
}) {
  if (!tabs.length) return null;
  const initial = defaultValue ?? tabs[0].id;

  return (
    <Tabs defaultValue={initial} className={cn("my-6", className)}>
      <TabsList className="h-auto flex-wrap gap-1">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="text-[13px]">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          className="mt-4 rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4 text-sm leading-relaxed text-foreground/80"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
