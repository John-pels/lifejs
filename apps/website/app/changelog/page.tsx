import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Track the latest Life.js version updates. Life.js is the first fullstack framework to build agentic web applications. It is minimal, extensible, and typesafe. Well, everything you love.",
};

interface Change {
  content: string;
  authors: string[];
  isNewContributor: boolean;
  link: string;
  linkType: "commit" | "pr";
}

interface Version {
  version: string;
  date?: string;
  breaking: Change[];
  features: Change[];
  fixes: Change[];
}

async function parseChangelog(): Promise<Version[]> {
  try {
    const changelogPath = join(process.cwd(), "../..", "packages/life/CHANGELOG.md");
    const content = await readFile(changelogPath, "utf-8");

    const versions: Version[] = [];
    const lines = content.split("\n");

    let currentVersion: Version | null = null;
    let currentSection: "breaking" | "features" | "fixes" | null = null;

    for (const line of lines) {
      // Match version headers like "## 0.1.1"
      // biome-ignore lint/performance/useTopLevelRegex: no perfs issue here
      const versionMatch = line.match(/^## (\d+\.\d+\.\d+)/);
      if (versionMatch) {
        if (currentVersion) {
          versions.push(currentVersion);
        }
        currentVersion = {
          version: versionMatch[1],
          breaking: [],
          features: [],
          fixes: [],
        };
        currentSection = null;
        continue;
      }

      // Match section headers
      if (line.includes("### Major Changes")) {
        currentSection = "breaking";
        continue;
      }
      if (line.includes("### Minor Changes")) {
        currentSection = "features";
        continue;
      }
      if (line.includes("### Patch Changes")) {
        currentSection = "fixes";
        continue;
      }

      // Parse individual changes
      if (currentVersion && currentSection && line.startsWith("- ")) {
        const change = parseChangeLine(line);
        if (change) {
          currentVersion[currentSection].push(change);
        }
      }
    }

    if (currentVersion) {
      versions.push(currentVersion);
    }

    return versions.slice(0, 10); // Return last 10 versions
  } catch (error) {
    console.error("Failed to parse changelog:", error);
    return [];
  }
}

function parseChangeLine(line: string): Change | null {
  // Parse line format: "- [@author](link) **(New contributor! 🎉)** in [commit](link) — description"
  // biome-ignore lint/performance/useTopLevelRegex: no perfs issue here
  const regex = /- (.+?) in \[([^\]]+)\]\(([^)]+)\) — (.+)/;
  const match = line.match(regex);

  if (!match) return null;

  const [, authorsText, linkText, linkUrl, content] = match;

  // Parse authors
  const authorMatches = [...authorsText.matchAll(/\[@([^\]]+)\]/g)];
  const authors = authorMatches.map((m) => m[1]);

  // Check if any author is new contributor
  const isNewContributor = authorsText.includes("**(New contributor! 🎉)**");

  // Determine link type
  const linkType = linkText.includes("#") ? "pr" : "commit";

  return {
    content: content.trim(),
    authors,
    isNewContributor,
    link: linkUrl,
    linkType,
  };
}

function ChangeItem({ change }: { change: Change }) {
  return (
    <div className="border-black/5 border-b py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="-space-x-1.5 flex shrink-0 pt-0.5">
          {change.authors.slice(0, 3).map((author) => (
            <Image
              alt={`${author}'s avatar`}
              className="h-5 w-5 rounded-full border border-white/80"
              key={author}
              src={`https://github.com/${author}.png?size=24`}
                sizes="24"
                width="24"
                height="24"
                priority
                aria-hidden="true"
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-black/80 text-sm leading-relaxed">{change.content}</p>
          <div className="flex items-center gap-2 text-black/40 text-xs">
            <span>
              {change.authors.map((author, idx) => (
                <span key={author}>
                  {idx > 0 && ", "}
                  <a
                    className="transition-colors hover:text-black/60"
                    href={`https://github.com/${author}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    @{author}
                  </a>
                </span>
              ))}
            </span>
            <span>•</span>
            <a
              className="transition-colors hover:text-black/60"
              href={change.link}
              rel="noopener noreferrer"
              target="_blank"
            >
              {change.linkType === "pr" ? "PR" : "commit"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function VersionSection({ title, changes }: { title: string; changes: Change[] }) {
  if (changes.length === 0) return null;

  return (
    <div className="mb-6">
      <h4 className="mb-3 font-medium text-black/60 text-sm">{title}</h4>
      <div className="space-y-0">
        {changes.map((change) => (
          <ChangeItem change={change} key={change.link} />
        ))}
      </div>
    </div>
  );
}

function VersionCard({ version }: { version: Version }) {
  const totalChanges = version.breaking.length + version.features.length + version.fixes.length;

  if (totalChanges === 0) return null;

  return (
    <div className="mb-12">
      <div className="mb-6 border-black/10 border-b pb-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-medium text-black text-xl">v{version.version}</h3>
          <span className="font-mono text-black/40 text-xs">
            {totalChanges} change{totalChanges !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <VersionSection changes={version.breaking} title="Breaking Changes" />
        <VersionSection changes={version.features} title="Features" />
        <VersionSection changes={version.fixes} title="Fixes" />
      </div>
    </div>
  );
}

export default async function ChangelogPage() {
  const versions = await parseChangelog();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-16 text-center">
          <h1 className="mb-4 font-medium text-3xl text-black tracking-tight">Changelog</h1>
          <p className="text-black/50 text-sm leading-relaxed">
            All notable changes to Life.js are documented here.
          </p>
        </div>

        {versions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-black/40 text-sm">No changelog entries found.</p>
          </div>
        ) : (
          <div>
            {versions.map((version) => (
              <VersionCard key={version.version} version={version} />
            ))}
          </div>
        )}

        <div className="mt-16 border-black/5 border-t pt-8 text-center">
          <a
            className="inline-flex items-center gap-1 text-black/50 text-sm transition-colors hover:text-black/70"
            href="https://github.com/lifejs/lifejs/blob/main/packages/life/CHANGELOG.md"
            rel="noopener noreferrer"
            target="_blank"
          >
            View full changelog on GitHub
            <svg
              aria-label="External link"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>External link</title>
              <path
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
