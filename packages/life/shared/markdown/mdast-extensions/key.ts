import type Mdast from "mdast";
import type { Extension } from "mdast-util-from-markdown";

const traverse = (node: Mdast.Nodes, id: number): void => {
  // Set the key
  node.key = id;
  // Traverse children recursively
  let counter = 0;
  if (!("children" in node && Array.isArray(node.children))) return;
  for (const child of node.children) traverse(child, counter++);
};

/**
 * An extension to set a unique key on each node among its siblings (used for memoization)
 */
export const keyFromMarkdown: Extension = {
  transforms: [(tree) => traverse(tree, 0)],
};
