"use client";

import { AnchorProvider, ScrollProvider, TOCItem, type TOCItemType } from "fumadocs-core/toc";
import { useRef } from "react";

interface Props {
  toc: TOCItemType[];
}

export function TableOfContents({ toc }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (toc.length === 0) return null;

  return (
    <AnchorProvider single toc={toc}>
      <nav className="w-56 shrink-0">
        <div className="sticky top-6">
          <span className="mb-2 block font-medium text-neutral-500 text-xs">On this page</span>
          <ScrollProvider containerRef={containerRef}>
            <div
              className="flex max-h-[calc(100vh-8rem)] flex-col gap-1 overflow-y-auto"
              ref={containerRef}
            >
              {toc.map((item) => (
                <TOCItem
                  className="block text-neutral-600 text-sm transition-colors hover:text-neutral-900 data-[active=true]:font-medium data-[active=true]:text-neutral-900"
                  href={item.url}
                  key={item.url}
                  style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}
                >
                  {item.title}
                </TOCItem>
              ))}
            </div>
          </ScrollProvider>
        </div>
      </nav>
    </AnchorProvider>
  );
}
