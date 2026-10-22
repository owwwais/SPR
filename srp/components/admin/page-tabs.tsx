"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PageTab = { value: string; label: string; content: React.ReactNode };

// Underline tabs for a whole page (DESIGN.md §9): settings (P4f, one save
// per tab instead of one 2,400px page — UI-H1) and the interviews hub (P4e).
// The open tab is kept in ?tab= through the History API — no server round
// trip — so a refresh or a link from elsewhere lands on the same tab.
export function PageTabs({ tabs, initial }: { tabs: PageTab[]; initial: string }) {
  return (
    <Tabs
      defaultValue={initial}
      onValueChange={(value) => {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", String(value));
        window.history.replaceState(null, "", url);
      }}
      className="gap-6"
    >
      <TabsList
        variant="line"
        className="h-10! w-full justify-start gap-5 overflow-x-auto rounded-none border-b p-0"
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-0.5 after:bottom-[-1px]!">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-6">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
