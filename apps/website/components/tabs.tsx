"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  items: string[];
  children: ReactNode;
  persist?: { id: string };
  defaultIndex?: number;
}

export function Tabs({ items, children, defaultIndex = 0 }: TabsProps) {
  const [activeTab, setActiveTab] = useState(items[defaultIndex]);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="mb-4">
        <div className="flex gap-1 border-neutral-200 border-b">
          {items.map((item) => (
            <button
              className={`px-3 py-1.5 text-sm transition-colors ${
                activeTab === item
                  ? "border-neutral-900 border-b-2 font-medium text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
              key={item}
              onClick={() => setActiveTab(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="pt-2">{children}</div>
      </div>
    </TabsContext.Provider>
  );
}

interface TabProps {
  value: string;
  children: ReactNode;
}

export function Tab({ value, children }: TabProps) {
  const context = useContext(TabsContext);
  if (!context) return null;

  if (context.activeTab !== value) return null;

  return <>{children}</>;
}
