import type Mdast from "mdast";
import type { Extension } from "mdast-util-from-markdown";
import type { Options } from "mdast-util-to-markdown";

const INLINE_ACTION_REGEX = /execute::([^(]+)\(([^)]*)\)/g;

const parseInput = (input?: string): Record<string, unknown> | undefined => {
  if (input === undefined) return;
  if (!input.trim()) return;
  try {
    const parsed = JSON.parse(input);
    // If parsed value is already an object, return it
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    // Otherwise, wrap it in an object with a "value" key
    return { value: parsed };
  } catch {
    // If JSON parsing fails, wrap the string in an object
    return { value: input };
  }
};

const processTextNode = (
  node: Mdast.Text & { type: "text"; value: string },
  parent?: Mdast.Nodes | undefined,
): void => {
  // Matches the inline action sequence occurrences
  const matches = Array.from(node.value.matchAll(INLINE_ACTION_REGEX));
  if (matches.length === 0) return;

  // Construct a new children array with the inline action nodes
  const parts: Array<Mdast.Text | Mdast.LifeInlineAction> = [];
  let lastIndex = 0;
  for (const match of matches) {
    // Skip if match index is undefined (shouldn't happen with matchAll, but be safe)
    if (match.index === undefined) continue;

    // Add text before match (only if non-empty)
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
    }

    // Add the inline action node
    const name = (match[1] as string).trim();
    const input = parseInput(match[2]);
    const startOffset = node.position?.start.offset ?? 0 + match.index;
    const endOffset = startOffset + match[0].length;
    const position = {
      start: { offset: startOffset, line: -1, column: -1 },
      end: { offset: endOffset, line: -1, column: -1 },
    };
    parts.push({ type: "lifeInlineAction", name, input, position });

    // Update the last index
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match (only if non-empty)
  if (lastIndex < node.value.length) {
    parts.push({ type: "text", value: node.value.slice(lastIndex) });
  }

  // Replace node in parent
  if (parent && "children" in parent && Array.isArray(parent.children)) {
    const index = parent.children.indexOf(node as never);
    if (index !== -1) parent.children.splice(index, 1, ...parts);
  }
};

const traverse = (node: Mdast.Nodes, parent?: Mdast.Nodes | undefined): void => {
  // If node is a text node
  if (node.type === "text") {
    processTextNode(node, parent);
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
 * An extension to parse `execute::<name>(<input>)` sequences in text nodes
 */
export const inlineActionFromMarkdown: Extension = {
  transforms: [(tree) => traverse(tree, undefined)],
};

/**
 * An extension to convert `inlineAction` nodes back to `execute::<name>(<input>)` markdown
 */
export const inlineActionToMarkdown: Options = {
  handlers: {
    lifeInlineAction: (node) => {
      if (node.input === undefined) return `execute::${node.name}()`;
      return `execute::${node.name}(${JSON.stringify(node.input)})`;
    },
  },
};
