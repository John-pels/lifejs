"use client";

import type { SortedResult } from "fumadocs-core/search";
import { useDocsSearch } from "fumadocs-core/search/client";
import Link from "next/link";
import { useEffect, useRef } from "react";

function Highlight({ text }: { text: SortedResult["contentWithHighlights"] }) {
  return (
    <>
      {text?.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list
        <span className={part.styles?.highlight ? "bg-yellow-200 font-medium" : ""} key={i}>
          {part.content}
        </span>
      ))}
    </>
  );
}

type GroupedResults = Map<string, { pageTitle: string; items: SortedResult[] }>;

function groupByPage(results: SortedResult[]): GroupedResults {
  const groups: GroupedResults = new Map();

  for (const result of results) {
    const pageUrl = result.url.split("#")[0];

    if (!groups.has(pageUrl)) {
      const pageResult = results.find((r) => r.type === "page" && r.url === pageUrl);
      groups.set(pageUrl, {
        pageTitle: pageResult?.content ?? pageUrl.split("/").pop() ?? "",
        items: [],
      });
    }

    if (result.type !== "page") groups.get(pageUrl)?.items.push(result);
  }

  return groups;
}

export function SearchBar() {
  const { search, setSearch, query } = useDocsSearch({ type: "fetch" });
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = search.length > 0;

  const results = query.data && query.data !== "empty" ? query.data : [];
  const grouped = groupByPage(results);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearch("");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setSearch]);

  return (
    <>
      <div className="relative">
        <input
          className="w-48 rounded border border-neutral-300 bg-neutral-50 px-3 py-1 text-sm placeholder:text-neutral-400"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search... ⌘K"
          ref={inputRef}
          type="text"
          value={search}
        />
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
          <button
            aria-label="Close search"
            className="absolute inset-0 cursor-default border-none bg-black/50 backdrop-blur-sm"
            onClick={() => setSearch("")}
            type="button"
          />
          <div
            className="relative w-full max-w-lg rounded-lg border border-neutral-200 bg-white shadow-2xl"
            role="dialog"
          >
            <div className="border-neutral-200 border-b p-4">
              <input
                autoFocus
                className="w-full text-lg outline-none"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documentation..."
                type="text"
                value={search}
              />
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {query.isLoading ? (
                <div className="p-4 text-center text-neutral-500 text-sm">Searching...</div>
              ) : null}

              {!query.isLoading && results.length === 0 ? (
                <div className="p-4 text-center text-neutral-500 text-sm">No results found</div>
              ) : null}

              {query.isLoading
                ? null
                : Array.from(grouped.entries()).map(([pageUrl, group]) => (
                    <div className="mb-2" key={pageUrl}>
                      <Link
                        className="block rounded px-3 py-2 font-medium text-neutral-900 text-sm hover:bg-neutral-100"
                        href={pageUrl}
                        onClick={() => setSearch("")}
                      >
                        {group.pageTitle}
                      </Link>
                      {group.items.map((item) => (
                        <Link
                          className="block rounded px-3 py-1.5 pl-6 text-neutral-600 text-sm hover:bg-neutral-100"
                          href={item.url}
                          key={item.id}
                          onClick={() => setSearch("")}
                        >
                          <Highlight text={item.contentWithHighlights} />
                        </Link>
                      ))}
                    </div>
                  ))}
            </div>

            <div className="border-neutral-200 border-t p-2 text-center text-neutral-400 text-xs">
              ESC to close
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
