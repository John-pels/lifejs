import type Mdast from "mdast";
import type { Extension } from "mdast-util-from-markdown";
import type { Options } from "mdast-util-to-markdown";

const INTERRUPTED_REGEX = /\[Interrupted by (user|agent)\]/g;

const traverse = (node: Mdast.Nodes, parent?: Mdast.Nodes | undefined): void => {
  // If node is a text node
  if (node.type === "text") {
    // Matches the interrupted sequence occurrences
    const matches = Array.from(node.value.matchAll(INTERRUPTED_REGEX));
    if (matches.length === 0) return;

    // Construct a new children array with the interrupted nodes
    const parts: Array<Mdast.Text | Mdast.LifeInterrupted> = [];
    let lastIndex = 0;
    for (const match of matches) {
      // Add text before match (only if non-empty)
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
      }

      // Add the interrupted node
      const author = match[1] as "user" | "agent";
      const startOffset = node.position?.start.offset ?? 0 + match.index;
      const endOffset = startOffset + match[0].length;
      const position = {
        start: { offset: startOffset, line: -1, column: -1 },
        end: { offset: endOffset, line: -1, column: -1 },
      };
      parts.push({ type: "lifeInterrupted", author, position });

      // Update the last index
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match (only if non-empty)
    if (lastIndex < node.value.length) {
      parts.push({ type: "text", value: node.value.slice(lastIndex) });
    }

    // Replace node in parent
    if (parent && "children" in parent) {
      const index = parent.children.indexOf(node as never);
      if (index !== -1) parent.children.splice(index, 1, ...parts);
    }
    return;
  }

  // Traverse children recursively (backwards to avoid issues when modifying parent.children)
  if (!("children" in node)) return;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (child) traverse(child, node);
  }
};

/**
 * An extension to parse `[Interrupted by <user|agent>]` sequences in text nodes
 */
export const interruptedMarkerFromMarkdown: Extension = {
  transforms: [(tree) => traverse(tree, undefined)],
};

/**
 * An extension to convert `interrupted` nodes back to `[Interrupted by <user|agent>]` markdown
 */
export const interruptedMarkerToMarkdown: Options = {
  handlers: {
    lifeInterrupted: (node) => `[Interrupted by ${node.author}]`,
  },
};
