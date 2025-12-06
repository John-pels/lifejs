import { getGithubLastEdit } from "fumadocs-core/content/github";
import { notFound } from "next/navigation";
import { components } from "@/lib/mdx-components";
import { source } from "@/lib/source";
import { TableOfContents } from "../toc";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const Content = page.data.body;
  const toc = page.data.toc;

  let lastEdit: Date | null = null;
  if (process.env.NODE_ENV === "development") {
    lastEdit = new Date();
  } else {
    try {
      lastEdit = await getGithubLastEdit({
        owner: "pows-dev",
        repo: "lifejs",
        path: `apps/website/content/docs/${page.path}`,
      });
    } catch {
      // Silently fail if GitHub API is unavailable
    }
  }

  return (
    <div className="flex justify-between py-16">
      <div className="flex w-full justify-center">
        <article className="max-w-[600px] flex-1">
          <Content components={components} />
          {lastEdit !== null && (
            <p className="mt-12 border-neutral-200 border-t pt-4 text-neutral-500 text-sm">
              Last updated:{" "}
              {lastEdit.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </article>
      </div>
      <TableOfContents toc={toc} />
    </div>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
