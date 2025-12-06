"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

interface CodeBlockTabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const CodeBlockTabsContext = createContext<CodeBlockTabsContextValue | null>(null);

interface CodeBlockTabsProps {
  children: ReactNode;
  defaultValue?: string;
}

export function CodeBlockTabs({ children, defaultValue = "" }: CodeBlockTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue);

  return (
    <CodeBlockTabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="mb-4">{children}</div>
    </CodeBlockTabsContext.Provider>
  );
}

interface CodeBlockTabsListProps {
  children: ReactNode;
}

export function CodeBlockTabsList({ children }: CodeBlockTabsListProps) {
  return <div className="flex gap-1 border-neutral-200 border-b">{children}</div>;
}

interface CodeBlockTabsTriggerProps {
  value: string;
  children: ReactNode;
}

export function CodeBlockTabsTrigger({ value, children }: CodeBlockTabsTriggerProps) {
  const context = useContext(CodeBlockTabsContext);
  if (!context) return null;

  const isActive = context.activeTab === value;

  return (
    <button
      className={`px-3 py-1.5 text-sm transition-colors ${
        isActive
          ? "border-neutral-900 border-b-2 font-medium text-neutral-900"
          : "text-neutral-500 hover:text-neutral-700"
      }`}
      onClick={() => context.setActiveTab(value)}
      type="button"
    >
      {children}
    </button>
  );
}

interface CodeBlockTabProps {
  value: string;
  children: ReactNode;
}

export function CodeBlockTab({ value, children }: CodeBlockTabProps) {
  const context = useContext(CodeBlockTabsContext);
  if (!context) return null;

  if (context.activeTab !== value) return null;

  return <div className="pt-2">{children}</div>;
}
