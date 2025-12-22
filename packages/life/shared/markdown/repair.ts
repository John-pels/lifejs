import type Mdast from "mdast";
import * as op from "@/shared/operation";
import { newId } from "../id";
import { markdownFromTree, markdownToTree } from "./tree";

/**
 * Coverage:
 * ✅ = repaired
 * ❌ = might need repair, but not supported yet
 *
 * ---
 *
 * ✅ blockquote
 * ✅ break
 * ✅ code
 * ❌ definition
 * ✅ delete
 * ✅ emphasis
 * ❌ footnoteDefinition
 * ❌ footnoteReference
 * ✅ heading
 * ❌ html
 * ✅ image
 * ✅ imageReference
 * ✅ inlineCode
 * ✅ inlineMath
 * ✅ lifeInlineAction
 * ✅ lifeInterrupted
 * ✅ link
 * ✅ linkReference
 * ✅ list
 * ✅ listItem
 * ✅ math
 * ❌ mdxFlowExpression
 * ❌ mdxJsxFlowElement
 * ❌ mdxJsxTextElement
 * ❌ mdxTextExpression
 * ❌ mdxjsEsm
 * ✅ paragraph
 * ✅ strong
 * ✅ table
 * ✅ tableCell
 * ✅ tableRow
 * ✅ text
 * ✅ thematicBreak
 * ❌ yaml
 */

/**
 * Regex patterns for matching markdown formatting sequences.
 * Each pattern matches exactly N markers, not surrounded by more of the same.
 */
const PATTERNS = {
  inlineCode: /(?<!\\)`/g,
  inlineMath: /(?<!\\)\$\$/g,
  boldItalicAsterisk: /(?<!\\)(?<!\*)\*\*\*(?!\*)/g,
  boldItalicUnderscore: /(?<!\\)(?<!_)(?:(?<=\s|^)___|___(?=\s|$))(?!_)/g,
  boldAsterisk: /(?<!\\)(?<!\*)\*\*(?!\*)/g,
  boldUnderscore: /(?<!\\)(?<!_)(?:(?<=\s|^)__|__(?=\s|$))(?!_)/g,
  italicAsterisk: /(?<!\\)(?<!\*)\*(?!\*)/g,
  italicUnderscore: /(?<!\\)(?<!_)(?:(?<=\s|^)_|_(?=\s|$))(?!_)/g,
  strikethroughDouble: /(?<!\\)~~/g,
  strikethroughSingle: /(?<!~)(?<!\\)~(?!~)/g,
};

const PARTIAL_MARKER = "\uE000";

/**
 * Wraps markdownFromTree() to handle backslashes and trailing whitespace.
 * @param node The node to convert to markdown.
 * @returns The markdown string or an error.
 */
const safeMarkdownFromTree = (node: Mdast.Nodes) => {
  // Encode any backslash so those are not mixed with the ones added by mdast
  const walkEscape = (node_: Mdast.Nodes) => {
    if (node_.type === "text") node_.value = node_.value.replaceAll("\\", "<ENCODED_BACKSLASH>");
    if ("children" in node_) for (const child of node_.children) walkEscape(child);
  };
  walkEscape(node);
  // Convert the node to markdown string
  const [errToMarkdown, content_] = markdownFromTree({ type: "root", children: [node as never] });
  if (errToMarkdown) return op.failure(errToMarkdown);
  // Remove any backslash added by mdast, and restore the encoded ones
  let content = content_;
  content = content.replaceAll("\\", "");
  content = content.replaceAll("<ENCODED_BACKSLASH>", "\\");
  // Remove trailing newline (mdast adds one) and decode trailing whitespace (sometimes mdast encodes them)
  content = content.replace(/\n$/, "").replaceAll("&#x20;", " ");
  // Return the content
  return op.success(content);
};

/**
 * Repairs a string possibly containing a partial markdown table.
 * @param value The string to repair.
 * @returns The repaired string or an error.
 */
const repairMarkdownTable = (value: string): [false | number, string] => {
  // Find start of the table block (if any)
  // Tables must start with | at the beginning of a line (or start of string)
  const tableMatch = value.match(/(^|\n)\|/);
  if (!tableMatch) return [false, ""];
  const tableStartsAt = (tableMatch.index ?? 0) + (tableMatch[1] === "\n" ? 1 : 0);

  // Parse and analyze the table
  const lines = value.slice(tableStartsAt).split("\n");
  const header = lines[0] ?? "";
  const separator = lines[1] ?? "";
  const headerComplete = header.endsWith("|");
  const headerPipes = header.match(/\|/g)?.length ?? 0;
  const headerColumns = Math.max(1, headerPipes - (headerComplete ? 1 : 0));
  const separatorPipes = separator.match(/\|/g)?.length ?? 0;
  const separatorComplete = separatorPipes === headerPipes;

  // Generate the completion sequence
  // - If the header is not complete
  if (!headerComplete) return [tableStartsAt, `|\n${"|-".repeat(headerColumns)}|`];
  // - Or if the header is complete but no separator row exists
  if (headerComplete && !separator) return [tableStartsAt, `\n${"|-".repeat(headerColumns)}|`];
  // - Or if the separator exists but is not complete
  if (!separatorComplete) {
    const newSeperator = headerPipes - separatorPipes;
    return [
      tableStartsAt,
      `${separator.endsWith("-") ? "" : "-"}|${"-|".repeat(Math.max(0, newSeperator - 1))}`,
    ];
  }
  return [false, ""];
};

/**
 * Repairs a string possibly containing a partial markdown link or image.
 * @param value The string to repair.
 * @returns The repaired string or an error.
 */
const repairMarkdownLinkOrImage = (value: string) => {
  const matchUnclosedUrl = value.match(/(!)?\[[^\]]*\]\([^)]*$/);
  if (matchUnclosedUrl?.index !== undefined) return [matchUnclosedUrl.index, ")"] as const;

  const matchMissingUrl = value.match(/(!)?\[[^\]]*\]$/);
  if (matchMissingUrl?.index !== undefined) return [matchMissingUrl.index, "()"] as const;

  const matchUnclosedText = value.match(/(!)?\[[^\]]*$/);
  if (matchUnclosedText?.index !== undefined) return [matchUnclosedText.index, "]()"] as const;

  return [false as false | number, ""] as const;
};

/**
 * Repairs a string possibly containing a partial markdown inline action.
 * @param value The string to repair.
 * @returns The repaired string or an error.
 */
const repairInlineAction = (value: string) => {
  // We replace incomplete patterns with execute::PARTIAL()
  return value.replace(/execute::([^(\s]*)(?:\([^)]*)?$/g, (match) => {
    if (match.endsWith(")")) return match;
    return "execute::PARTIAL()";
  });
};

/**
 * Repairs a Markdown string possibly containing partial sequences.
 * @param content The string to repair.
 * @returns The repaired string or an error.
 */
const repairContent = (content_: string) => {
  // Repair incomplete execute:: sequences first (before other repairs)
  let content = repairInlineAction(content_);

  // Helper to find if a pattern has an unclosed opener
  const findUnclosedOpener = (pattern: RegExp): number | false => {
    const matches = Array.from(content.matchAll(pattern));
    if (matches.length % 2 !== 0) return matches.at(-1)?.index ?? false;
    return false;
  };

  // Find open sequences
  const context: Record<string, { opensAt: number; closing: string }> = {};
  // - inlineCode
  const backtickIndex = findUnclosedOpener(PATTERNS.inlineCode);
  if (backtickIndex !== false) context.inlineCode = { opensAt: backtickIndex, closing: "`" };
  // - inlineMath
  const dollarIndex = findUnclosedOpener(PATTERNS.inlineMath);
  if (dollarIndex !== false) context.inlineMath = { opensAt: dollarIndex, closing: "$$" };
  // - boldItalic (*** and ___)
  const boldItalic1Index = findUnclosedOpener(PATTERNS.boldItalicAsterisk);
  if (boldItalic1Index !== false)
    context.boldItalic1 = { opensAt: boldItalic1Index, closing: "***" };
  const boldItalic2Index = findUnclosedOpener(PATTERNS.boldItalicUnderscore);
  if (boldItalic2Index !== false)
    context.boldItalic2 = { opensAt: boldItalic2Index, closing: "___" };
  // - bold (** and __)
  const bold1Index = findUnclosedOpener(PATTERNS.boldAsterisk);
  if (bold1Index !== false) context.bold1 = { opensAt: bold1Index, closing: "**" };
  const bold2Index = findUnclosedOpener(PATTERNS.boldUnderscore);
  if (bold2Index !== false) context.bold2 = { opensAt: bold2Index, closing: "__" };
  // - italic (* and _)
  const italic1Index = findUnclosedOpener(PATTERNS.italicAsterisk);
  if (italic1Index !== false) context.italic1 = { opensAt: italic1Index, closing: "*" };
  const italic2Index = findUnclosedOpener(PATTERNS.italicUnderscore);
  if (italic2Index !== false) context.italic2 = { opensAt: italic2Index, closing: "_" };
  // - strikethrough (~~ and ~)
  const strike1Index = findUnclosedOpener(PATTERNS.strikethroughDouble);
  if (strike1Index !== false) context.strike1 = { opensAt: strike1Index, closing: "~~" };
  const strike2Index = findUnclosedOpener(PATTERNS.strikethroughSingle);
  if (strike2Index !== false) context.strike2 = { opensAt: strike2Index, closing: "~" };
  // - link or image
  const [linkOrImageIndex, linkOrImageClosingSequence] = repairMarkdownLinkOrImage(content);
  if (linkOrImageIndex !== false)
    context.linkOrImage = { opensAt: linkOrImageIndex, closing: linkOrImageClosingSequence };
  // - table
  const [tableIndex, tableClosingSequence] = repairMarkdownTable(content);
  if (tableIndex !== false) context.table = { opensAt: tableIndex, closing: tableClosingSequence };

  // Repair open sequences (process in reverse order)
  const sortedContext = Object.entries(context).sort((a, b) => b[1].opensAt - a[1].opensAt);
  for (const [type, item] of sortedContext) {
    // Skip repairing if the opening syntax is inside inlineCode or inlineMath
    const skip = ["inlineCode", "inlineMath"].some(
      (type_) => context[type_] && context[type_].opensAt < item.opensAt,
    );
    if (skip) continue;
    // Remove opening syntax if empty
    const isEmpty =
      !["linkOrImage", "table"].includes(type) &&
      item.opensAt === content.length - item.closing.length;
    if (isEmpty) content = content.slice(0, item.opensAt);
    // Else insert the partial marker then the closing syntax
    else content += PARTIAL_MARKER + item.closing;
  }

  return op.success(content);
};

/**
 * Partial markdown sequences will always be contained in text nodes.
 * Text nodes always have a paragraph, heading or tableCell node as ancestor.
 * We use those common ancestors to have only 3 majors repair scenarios to cover.
 */
type RepairableNode = Mdast.TableCell | Mdast.Heading | Mdast.Paragraph;
const isRepairable = (node: Mdast.Nodes): node is RepairableNode =>
  ["tableCell", "heading", "paragraph"].includes(node.type);

const getRepairableNodes = (tree: Mdast.Root) => {
  const nodes: { node: RepairableNode; parent: Mdast.Nodes }[] = [];
  const walk = (node: Mdast.Nodes) => {
    if (!("children" in node)) return;
    for (const child of node.children) {
      if (isRepairable(child)) nodes.push({ node: child, parent: node });
      else walk(child);
    }
  };
  walk(tree);
  return nodes;
};

/**
 * Sub-nodes that can be contained in a repairable node.
 */
type SubNode = Extract<
  Mdast.Nodes,
  {
    type:
      | "text"
      | "emphasis"
      | "strong"
      | "delete"
      | "link"
      | "linkReference"
      | "image"
      | "imageReference"
      | "inlineCode"
      | "inlineMath"
      | "lifeInlineAction"
      | "break";
  }
>;

const cycleMdast = (nodeOrTree: Mdast.Nodes | Mdast.Root) => {
  const [errSafeFromMarkdown, content] = safeMarkdownFromTree(nodeOrTree);
  if (errSafeFromMarkdown) return op.failure(errSafeFromMarkdown);
  const [errSafeToMarkdown, normalizedTree] = markdownToTree(content);
  if (errSafeToMarkdown) return op.failure(errSafeToMarkdown);
  if (nodeOrTree.type === "root") return op.success(normalizedTree);
  return op.success(normalizedTree.children.at(0));
};

const safeNodes = [
  "inlineMath",
  "inlineCode",
  "image",
  "imageReference",
  "lifeInlineAction",
  "lifeInterrupted",
];

/**
 * Repairs an mdast Markdown tree potentially containing partial sequences.
 * @param tree The tree to repair.
 * @returns The repaired tree or an error.
 */
export const repairTree = (tree: Mdast.Root) => {
  // Find repairable nodes in the tree
  const repairableNodes = getRepairableNodes(tree);

  // Repair each repairable node
  for (const { node: repairableNode, parent } of repairableNodes) {
    // Convert the repairable node to a repaired markdown string
    const placeholders: Map<string, string> = new Map();
    const walkRepair = (node: Mdast.Nodes): op.OperationResult<string> => {
      // 1. Convert all children to repaired text nodes
      const children: SubNode[] = "children" in node ? (node.children as SubNode[]) : [];
      for (const child of children) {
        // Keep text nodes as is
        if (child.type === "text") continue;
        // Replace the non-text child by a placeholder
        const placeholderId = newId();
        const repairedChild = { type: "text", value: `{${placeholderId}}` };
        children.splice(children.indexOf(child as never), 1, repairedChild as never);
        // Special case for break nodes - preserve the hard break syntax
        if (child.type === "break") placeholders.set(placeholderId, "  \n");
        // Ignore nodes that cannot contain Markdown, fill the placeholder with their content as is
        else if (safeNodes.includes(child.type)) {
          const rootNode: Mdast.Root = { type: "root", children: [child] };
          const [errToMarkdown_, markdown_] = safeMarkdownFromTree(rootNode);
          if (errToMarkdown_) return op.failure(errToMarkdown_);
          placeholders.set(placeholderId, markdown_);
        }
        // Repair other node type
        else {
          // Convert the child to a paragraph node
          const type = child.type;
          child.type = "paragraph" as never;
          // Convert the child to a repaired text node
          const [errWalkChild, repairedChildText] = walkRepair(child);
          if (errWalkChild) return op.failure(errWalkChild);
          // Build back the original node type
          if ("children" in child) child.children = [{ type: "text", value: repairedChildText }];
          // Obtain the delimiters
          let delimiters = { prefix: "", suffix: "" };
          if (type === "strong") delimiters = { prefix: "**", suffix: "**" };
          else if (type === "emphasis") delimiters = { prefix: "_", suffix: "_" };
          else if (type === "delete") delimiters = { prefix: "~~", suffix: "~~" };
          else if (type === "inlineMath") delimiters = { prefix: "$$", suffix: "$$" };
          else if (type === "image") delimiters = { prefix: "![", suffix: `](${child.url})` };
          else if (type === "link") delimiters = { prefix: "[", suffix: `](${child.url})` };
          else if (type === "linkReference")
            delimiters = { prefix: "[", suffix: `][${child.identifier}]` };
          // Build the placeholder
          const value = delimiters.prefix + repairedChildText + delimiters.suffix;
          placeholders.set(placeholderId, value);
        }
      }
      if ("children" in node) node.children = children;

      // 2. Stringify the node to markdown
      const [errToMarkdown, markdown] = safeMarkdownFromTree({
        type: "root",
        children: [node as never],
      });
      if (errToMarkdown) return op.failure(errToMarkdown);

      // 3. Repair the markdown
      const [errRepair, repaired] = repairContent(markdown);
      if (errRepair) return op.failure(errRepair);
      return op.success(repaired);
    };
    const [errWalk, repairedMarkdown] = walkRepair(repairableNode);
    if (errWalk) return op.failure(errWalk);

    // Replace placeholders in the repaired markdown string
    let replacedMarkdown = repairedMarkdown;
    let hasChanged = true;
    while (hasChanged) {
      hasChanged = false;
      for (const [placeholderId, placeholderValue] of placeholders.entries()) {
        const placeholderRegex = new RegExp(`{${placeholderId}}`, "g");
        const previousLength = replacedMarkdown.length;
        // Use a replacer function to avoid special $ interpretation in replacement strings
        replacedMarkdown = replacedMarkdown.replace(placeholderRegex, () => placeholderValue);
        if (previousLength !== replacedMarkdown.length) hasChanged = true;
      }
    }

    // Convert the repaired markdown string back to tree
    const [errToTree, repairedTree] = markdownToTree(replacedMarkdown);
    if (errToTree) return op.failure(errToTree);

    // Replace the node by the repaired node
    if ("children" in parent) {
      parent.children.splice(
        parent.children.indexOf(repairableNode as never),
        1,
        ...repairedTree.children,
      );
    }
  }

  // Remove empty nodes
  const walkEmpty = (node: Mdast.Nodes, parent: Mdast.Nodes | null) => {
    const removeNode = () =>
      parent &&
      "children" in parent &&
      parent.children.splice(parent.children.indexOf(node as never), 1);

    // In case of unclosed math block on new line, e.g. "$$x = y", mdast will
    // parse the value ("x = y") as the meta, and the value will be empty.
    // Here we fix this by transferring the meta to the value.
    if (node.type === "math" && node.value === "" && node.meta) {
      node.value = node.meta;
      node.meta = null;
    }

    if ("value" in node && node.value.length === 0) removeNode();
    if ("children" in node) {
      if (node.children.length) for (const child of node.children) walkEmpty(child, node);
      else removeNode();
    }
  };
  for (let i = 0; i < 10; i++) walkEmpty(tree, null);

  // Set `partial` flag on lineage of nodes containing partial markers
  const walkPartial = (node: Mdast.Nodes) => {
    const isPartial = JSON.stringify(node).includes(PARTIAL_MARKER);
    if (isPartial) node.partial = true;
    if ("children" in node) for (const child of node.children) walkPartial(child);
  };
  walkPartial(tree);

  // Strip all partial markers from the tree
  const strippedTree = JSON.parse(JSON.stringify(tree).replaceAll(PARTIAL_MARKER, ""));

  // Perform an mdast cycle to ensure all positions are correct
  const [errFinalTree, finalTree] = cycleMdast(strippedTree as Mdast.Root);
  if (errFinalTree) return op.failure(errFinalTree);

  // Return success
  return op.success(finalTree);
};

/**
 * Repairs a Markdown string potentially containing partial sequences.
 * @param content The string to repair.
 * @returns The repaired string or an error.
 */
export const repairMarkdown = (content: string) => {
  // 1. Parse the markdown content as tree (without autolinks)
  const [errTree, tree] = markdownToTree(content, false);
  if (errTree) return op.failure(errTree);

  // 2. Repair partial markdown sequences in the tree
  const [errRepair, repairedTree] = repairTree(tree);
  if (errRepair) return op.failure(errRepair);

  // 3. Convert the tree back to markdown
  const [errMarkdown, repairedContent] = safeMarkdownFromTree(repairedTree);
  if (errMarkdown) return op.failure(errMarkdown);

  // 4. Return the repaired markdown
  return op.success(repairedContent);
};
