"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocsNav, ReferencesNav } from "../../components/docs-nav";

interface Props {
  children: React.ReactNode;
}

type DocsSection = "framework" | "references";

export default function DocsLayout({ children }: Props) {
  const router = useRouter();
  const [section, setSection] = useState<DocsSection>("framework");

  const handleSectionChange = (value: DocsSection) => {
    setSection(value);
    if (value === "references") router.push("/docs/references");
    else router.push("/docs/welcome/introduction");
  };

  return (
    <div className="flex">
      <aside className="w-56 border-neutral-200 border-r bg-neutral-50 p-4">
        <select
          className="mb-4 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          onChange={(e) => handleSectionChange(e.target.value as DocsSection)}
          value={section}
        >
          <option value="framework">Life.js (the Framework)</option>
          <option value="references">References</option>
        </select>
        {section === "framework" ? <DocsNav /> : <ReferencesNav />}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
