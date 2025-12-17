import type Mdast from "mdast";
import { type FC, Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as op from "@/shared/operation";
import { canon } from "../canon";
import { repairTree } from "./repair";
import { markdownToTree } from "./tree";

interface RenderMarkdownComponents {
  parent: (args: { partial: boolean; children: React.ReactNode }) => React.ReactNode;
  heading: (args: {
    partial: boolean;
    children: React.ReactNode;
    level: number;
  }) => React.ReactNode;
  paragraph: (args: { partial: boolean; children: React.ReactNode }) => React.ReactNode;
  bold: (args: { partial: boolean; children: React.ReactNode }) => React.ReactNode;
  italic: (args: { partial: boolean; children: React.ReactNode }) => React.ReactNode;
  strikethrough: (args: { partial: boolean; children: React.ReactNode }) => React.ReactNode;
  link: (args: { partial: boolean; url: string; children: React.ReactNode }) => React.ReactNode;
  image: (args: {
    partial: boolean;
    children: React.ReactNode;
    url: string;
    alt?: string | null;
  }) => React.ReactNode;
  list: (args: {
    partial: boolean;
    ordered: boolean;
    items: { partial: boolean; children: React.ReactNode }[];
  }) => React.ReactNode;
  table: (args: {
    partial: boolean;
    rows: {
      partial: boolean;
      isHeader: boolean;
      cells: { partial: boolean; children: React.ReactNode }[];
    }[];
  }) => React.ReactNode;
  code: (args: { partial: boolean; language: string; content: string }) => React.ReactNode;
  inlineCode: (args: { partial: boolean; content: string }) => React.ReactNode;
  math: (args: { partial: boolean; content: string }) => React.ReactNode;
  inlineMath: (args: { partial: boolean; content: string }) => React.ReactNode;
  lifeInterrupted: (args: { author: "user" | "agent" }) => React.ReactNode;
  lifeInlineAction: (args: {
    partial: boolean;
    name: string;
    input: Record<string, unknown> | undefined;
  }) => React.ReactNode;
  blockquote: (args: { partial: boolean; children: React.ReactNode }) => React.ReactNode;
  seperator: () => React.ReactNode;
  custom: Record<string, (args: { children: React.ReactNode }) => React.ReactNode>;
}

const lastRenders = new Map<
  string,
  {
    hash: string;
    content: string;
    deltaContent: string;
    tree: Mdast.Root;
    render: React.ReactNode;
    nodesRender: React.ReactNode[];
  }
>();

const renderTreeNodes = (parent: Mdast.Nodes, components: RenderMarkdownComponents) => {
  const renderedNodes: React.ReactNode[] = [];
  const parentChildren = "children" in parent ? parent.children : [];
  const c = components;
  for (const node of parentChildren) {
    let r: React.ReactNode = null;
    const children = renderTreeNodes(node, components);
    if (node.type === "text") {
      const words = node.value.split(" ");
      r = words.flatMap((word, i) => [word, words.length - 1 === i ? "" : " "]);
    } else if (node.type === "heading")
      r = c.heading?.({ children, level: node.depth, partial: node.partial ?? false });
    else if (node.type === "paragraph")
      r = c.paragraph?.({ children, partial: node.partial ?? false });
    else if (node.type === "strong") r = c.bold?.({ children, partial: node.partial ?? false });
    else if (node.type === "emphasis") r = c.italic?.({ children, partial: node.partial ?? false });
    else if (node.type === "link")
      r = c.link?.({ children, url: node.url, partial: node.partial ?? false });
    else if (node.type === "delete")
      r = c.strikethrough?.({ children, partial: node.partial ?? false });
    else if (node.type === "image")
      r = c.image?.({ children, url: node.url, alt: node.alt, partial: node.partial ?? false });
    else if (node.type === "list")
      r = c.list?.({
        items: children.map((child) => ({ children: child, partial: node.partial ?? false })),
        ordered: node.ordered ?? false,
        partial: node.partial ?? false,
      });
    else if (node.type === "table") {
      const rows = node.children
        .map((row, rowIndex) => {
          if (row.type !== "tableRow") return null;
          const cells = row.children
            .map((cell) => {
              if (cell.type !== "tableCell") return null;
              const cellChildren = renderTreeNodes(cell, components);
              return { children: cellChildren, partial: (cell.partial ?? false) as boolean };
            })
            .filter((cell): cell is NonNullable<typeof cell> => cell !== null);
          return {
            isHeader: rowIndex === 0,
            partial: (row.partial ?? false) as boolean,
            cells,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      r = c.table?.({ rows, partial: node.partial ?? false });
    }
    if (r !== null) renderedNodes.push(<Fragment key={node.key}>{r}</Fragment>);
  }
  return renderedNodes;
};

function renderMarkdown(params: {
  cacheKey: string;
  content: string;
  components: RenderMarkdownComponents;
}) {
  try {
    let { cacheKey, content, components } = params;

    // Trim and normalize the content
    content = content.trim().replace(/\r\n?/g, "\n");
    if (!content.length) return op.success(null);

    // Return previous render if the content hasn't changed
    const [errHash, hash] = canon.murmur3(content);
    if (errHash) return op.failure(errHash);
    const prevRender = lastRenders.get(cacheKey);
    if (hash === prevRender?.hash) return op.success(prevRender.render);

    // Obtain the delta content since previous render
    let deltaContent = content;
    const hasPrevNodes =
      prevRender?.content.length &&
      prevRender.tree.children.length > 1 &&
      content.startsWith(prevRender.content);
    if (hasPrevNodes) {
      // - Exclude already rendered content
      deltaContent = content.slice(prevRender.content.length);
      // - Re-introduce previous render last node for context
      const lastNodeOffset = prevRender.tree.children.at(-1)?.position?.start.offset;
      if (lastNodeOffset !== undefined) {
        deltaContent = prevRender.deltaContent.slice(lastNodeOffset) + deltaContent;
      }
    }

    // Compute the delta tree
    const [errTree, deltaTree] = markdownToTree(deltaContent);
    if (errTree) return op.failure(errTree);

    // Repair partial or broken Markdown sequences in the delta tree
    const [errRepair, repairedTree] = repairTree(deltaTree);
    if (errRepair) return op.failure(errRepair);

    // Fix keys in the delta tree
    let counter = hasPrevNodes ? (prevRender?.tree.children.at(-1)?.key ?? 0) : 0;
    for (const node of repairedTree.children) node.key = counter++;

    // Render the delta tree to React nodes
    const deltaNodesRender = renderTreeNodes(repairedTree, components);

    // Obtain the final nodes render by combining the previous and delta nodes render
    const prevNodesRender = hasPrevNodes ? (prevRender?.nodesRender.slice(0, -1) ?? []) : [];
    const nodesRender = [...prevNodesRender, ...deltaNodesRender];
    const render = components.parent?.({ children: nodesRender, partial: false });

    // Obtain the full tree by combining the previous and delta tree
    const prevChildren = hasPrevNodes ? (prevRender?.tree.children.slice(0, -1) ?? []) : [];
    const tree: Mdast.Root = {
      type: "root",
      children: [...prevChildren, ...repairedTree.children],
    };

    // Cache the result for next re-render
    lastRenders.set(cacheKey, {
      hash,
      tree,
      content,
      deltaContent,
      render,
      nodesRender,
    });

    // Return the render
    return op.success(render);
  } catch (error) {
    return op.failure({ code: "Unknown", cause: error });
  }
}

const defaultComponents = {
  parent: ({ children }) => <div>{children}</div>,
  heading: ({ children, level }) => {
    let h: React.ReactNode = null;
    if (level === 1) h = <h1>{children}</h1>;
    else if (level === 2) h = <h2>{children}</h2>;
    else if (level === 3) h = <h3>{children}</h3>;
    else if (level === 4) h = <h4>{children}</h4>;
    else if (level === 5) h = <h5>{children}</h5>;
    else if (level === 6) h = <h6>{children}</h6>;
    return h;
  },
  paragraph: ({ children }) => <p>{children}</p>,
  bold: ({ children }) => <strong>{children}</strong>,
  italic: ({ children }) => <em>{children}</em>,
  link: ({ children, url }) => <a href={url}>{children}</a>,
  strikethrough: ({ children }) => <s>{children}</s>,
  image: ({ url, alt }) => (
    // biome-ignore lint/performance/noImgElement: wanted here
    <img alt={alt ?? undefined} height={100} src={url} width={100} />
  ),
  list: () => (
    <p>List not implemented yet.</p>
    // <ul className={ordered ? "list-decimal" : "list-disc"}>{children}</ul>
  ),
  table: () => <p>Table not implemented yet.</p>,
  code: () => <p>Code not implemented yet.</p>,
  inlineCode: () => <p>Inline code not implemented yet.</p>,
  math: () => <p>Math not implemented yet.</p>,
  inlineMath: () => <p>Inline math not implemented yet.</p>,
  lifeInlineAction: () => <p>Life inline action not implemented yet.</p>,
  lifeInterrupted: () => <p>Life interrupted not implemented yet.</p>,
  blockquote: () => <p>Blockquote not implemented yet.</p>,
  seperator: () => <p>Seperator not implemented yet.</p>,
  custom: {},
} satisfies RenderMarkdownComponents;

interface MarkdownProps {
  cacheKey: string;
  children: string;
  components?: Partial<RenderMarkdownComponents>;
  throttleMs?: number;
}

export const Markdown: FC<MarkdownProps> = ({
  cacheKey,
  children,
  components,
  throttleMs = 100,
}) => {
  // Prepare the final components to use for rendering
  const mergedComponents = useMemo(
    () => ({ ...defaultComponents, ...(components ?? {}) }),
    [components],
  );

  // Throttle content updates
  const [throttledContent, setThrottledContent] = useState(children);
  const lastUpdateRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  useEffect(() => {
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);

    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= throttleMs) {
      setThrottledContent(children);
      lastUpdateRef.current = now;
    } else {
      timeoutRef.current = setTimeout(() => {
        setThrottledContent(children);
        lastUpdateRef.current = Date.now();
        timeoutRef.current = undefined;
      }, throttleMs - elapsed);
    }
    return () => {
      if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
    };
  }, [children, throttleMs]);

  // Render the Markdown content
  const rendered = useMemo(() => {
    const [errRender, render] = renderMarkdown({
      cacheKey,
      content: throttledContent,
      components: mergedComponents,
    });
    if (errRender) {
      console.error(errRender);
      return "Failed to render Markdown.";
    }
    return render;
  }, [cacheKey, throttledContent, mergedComponents]);

  return rendered;
};
