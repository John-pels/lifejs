import type Mdast from "mdast";
// @ts-expect-error no types available
import flattenNestedList from "mdast-flatten-nested-lists";
import { repairTree } from "@/shared/markdown/repair";
import { markdownToTree } from "@/shared/markdown/tree";
import * as op from "@/shared/operation";
import { latexToSpeech } from "./latex-to-speech";
import { KNOWN_PUNCT, PUNCT_RE } from "./punctuation";

export interface SpeechToken {
  value: string;
  position: { startsAt: number; endsAt: number };
}

const ignoredMarkdownNodes: Mdast.Nodes["type"][] = [
  "table",
  "code",
  "lifeInlineAction",
  "lifeInterrupted",
  "math",
  "mdxFlowExpression",
  "mdxJsxFlowElement",
  "mdxJsxTextElement",
  "mdxTextExpression",
  "mdxjsEsm",
  "yaml",
  "footnoteDefinition",
  "footnoteReference",
  "definition",
  "thematicBreak",
];

/**
 * Returns the expected column at which a specific block (paragraph/heading) should be rendered.
 * Use in tokenizeMarkdownTree() to determine the leading spaces to add to the tokens.
 */
const getExpectedBlockColumnStart = (node: Mdast.Nodes, parent: Mdast.Nodes) => {
  if (parent.type === "listItem") return node.position?.start.column ?? 3;
  if (parent.type === "blockquote") return node.position?.start.column ?? 2;
  return 1; // other nodes
};

/*
Mdast nodes treatment:

🗑️ = entire node excluded from output
💬 = transformed and included in output (when possible)

--- 

💬 blockquote
💬 break
🗑️ code
🗑️ definition
💬 delete
💬 emphasis
🗑️ footnoteDefinition
🗑️ footnoteReference
💬 heading
🗑️ html
💬 image
💬 imageReference
💬 inlineCode
💬 inlineMath
🗑️ lifeInlineAction
🗑️ lifeInterrupted
💬 link
💬 linkReference
💬 list
💬 listItem
🗑️ math
🗑️ mdxFlowExpression
🗑️ mdxJsxFlowElement
🗑️ mdxJsxTextElement
🗑️ mdxTextExpression
🗑️ mdxjsEsm
💬 paragraph
💬 strong
🗑️ table
🗑️ tableCell
🗑️ tableRow
💬 text
🗑️ thematicBreak
🗑️ yaml
*/
const tokenizeMarkdownTree = async (tree: Mdast.Root) => {
  let lastBlockNode: Mdast.Nodes | null = null;

  // Tokenize the root node of the tree
  const rootTokens: SpeechToken[] = [];
  await tokenizeMarkdownNode(tree, tree, rootTokens);
  async function tokenizeMarkdownNode(
    node: Mdast.Nodes,
    parent: Mdast.Nodes,
    tokens: SpeechToken[],
  ) {
    const startsAt = node.position?.start.offset ?? 0;
    const endsAt = node.position?.end.offset ?? 0;
    const position = { endsAt, startsAt };

    // Format the Markdown node into its spoken form
    // - ignored nodes (reflect their end offset on the previous token)
    if (ignoredMarkdownNodes.includes(node.type)) {
      const lastToken = tokens.at(-1);
      if (lastToken) lastToken.position.endsAt = endsAt;
      return;
    }
    // - break
    if (node.type === "break") tokens.push({ value: "\n", position });
    // - inline code (keep only alphanumeric, whitespaces, and a few allowed symbols)
    else if (node.type === "inlineCode") {
      const allowedInlineCodeSymbols = ["=", "+", "-"];
      const allowedSymbols = allowedInlineCodeSymbols.join("");
      const value = node.value
        .replace(new RegExp(`[^a-zA-Z0-9\\s${allowedSymbols}]`, "g"), " ") // replace by space, ensuring the other alphanumeric sequences are split
        .replace(/\s+/g, " ");
      if (value.trim()) tokens.push({ value, position });
    }
    // - inline math (convert LaTeX into its spoken form)
    else if (node.type === "inlineMath") {
      const value = await latexToSpeech(node.value);
      if (value.trim()) tokens.push({ value, position });
    }
    // - image, imageReference (use the alt text as the value when available)
    else if (node.type === "image" || node.type === "imageReference") {
      if (node.alt?.trim()) tokens.push({ value: node.alt, position });
    }
    // - text
    else if (node.type === "text" && node.value.trim())
      tokens.push({ value: node.value, position });

    // Tokenize nodes with children
    if ("children" in node) {
      // Obtain the children tokens
      const childrenTokens: SpeechToken[] = [];
      // biome-ignore lint/performance/noAwaitInLoops: sequential execution is required
      for (const child of node.children) await tokenizeMarkdownNode(child, node, childrenTokens);

      // For lists items, make sure each item is terminated by a delimiter symbol, else append a comma
      if (node.type === "listItem") {
        const delimiterSymbols = [".", "?", "!", ":", ";", ","];
        const lastTok = [...childrenTokens].filter((t) => t.value.trim()).at(-1);
        const lastChar = lastTok?.value?.trim()?.at(-1);
        if (lastTok && lastChar && !delimiterSymbols.includes(lastChar)) lastTok.value += ",";
      }

      // For paragraphs and headings, tokenize leading spaces (whitespace, newlines)
      if ((node.type === "paragraph" || node.type === "heading") && node.position) {
        // Add leading spaces (whitespace, newlines)
        const leadingSpaces: string[] = [];
        const expectedColumStart = getExpectedBlockColumnStart(node, parent);
        if (node.position.start.column > expectedColumStart) leadingSpaces.push(" ");
        const lastLine = lastBlockNode?.position?.end.line ?? 1;
        for (let i = 0; i < node.position.start.line - lastLine; i++) leadingSpaces.push("\n");
        for (const value of leadingSpaces) childrenTokens.unshift({ value, position });

        // Add trailing whitespaces
        const lastChild = node.children.at(-1);
        if (lastChild?.position) {
          for (let i = 0; i < node.position.end.column - lastChild.position.end.column; i++) {
            childrenTokens.push({ value: " ", position });
          }
        }

        // Update the last block node
        lastBlockNode = node;
      }

      // Reflect the node's end offset on the last token
      const lastToken = childrenTokens.at(-1);
      if (lastToken) lastToken.position.endsAt = endsAt;

      // Push the children tokens
      tokens.push(...childrenTokens);
    }
  }

  return rootTokens;
};

export const explodeTokenByWhitespaces = (token: SpeechToken) => {
  // Explode each token by whitespace or tab
  const spacedTokens: SpeechToken[] = [];

  // Split the token value by whitespace or tab
  const subValues = token.value.split(/(\s+)/).filter((v) => v.length > 0);
  let offset = token.position.startsAt;
  for (const value of subValues) {
    const startsAt = offset;
    const endsAt = startsAt + value.length;
    offset += value.length;
    spacedTokens.push({ value, position: { startsAt, endsAt } });
  }

  // Reflect the position end offset on the last token
  const lastToken = spacedTokens.at(-1);
  if (lastToken) lastToken.position.endsAt = token.position.endsAt;

  return spacedTokens;
};

/**
 * The SpeechTokenizer transforms text into their spoken form.
 * This includes:
 * - Stripping out Markdown syntaxes (e.g., "**bold**" -> "bold")
 * - While still keeping track of the original text position for each token
 * - Compatibility for incremental tokenization works (as long as two tokenize() calls have a shared text prefix)
 *
 * In the future, we might include:
 * - Stripping out characters that cannot be spoken (e.g., emojis)
 * - Expanding numbers and punctuation into their spoken form (e.g., "$" -> "dollar")
 *
 * It is used by the TTSBase class to pre-process LLM answers before feeding them to
 * the TTS model, while still being able to stream the text chunk transcript alongside
 * the generated voice audio chunks.
 */
class SpeechTokenizer {
  async tokenize(text: string) {
    if (!text.length) return op.success([]);

    // 1. Suffix the text with a temporary sequence to ensure the last node is a block node
    // This ensures trailing whitespace and newlines are properly captured
    text += "\n\nTEMPORARY";

    // 2. Convert the text into a Markdown tree
    const [errTree, mdTree] = markdownToTree(text);
    if (errTree) return op.failure(errTree);
    if (!mdTree.children.length) return op.success([]);

    // 3. Flatten any nested lists in the tree
    const flattenedTree = flattenNestedList()(mdTree);

    // 4. Repair the Markdown tree (partial or broken sequences)
    const [errRepair, repairedTree] = repairTree(flattenedTree);
    if (errRepair) return op.failure(errRepair);

    // 5. Convert the Mardown tree into a token array without markdown syntaxes
    const tokens = await tokenizeMarkdownTree(repairedTree);
    if (!tokens.length) return op.success([]);

    // 6. Remove the trailing "\nTEMPORARY" sequence tokens
    for (let i = 0; i < 3; i++) tokens.pop();

    // 7. Transform URLs into a readable form
    const urlsTokens: SpeechToken[] = [];
    for (const token of tokens) {
      const urlRegex = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]+/g;
      const newValue = token.value.replace(urlRegex, (value) => {
        const url = new URL(value);
        // file:// URLs
        if (url.protocol === "file:") {
          const filename = url.pathname.split("/").filter(Boolean).at(-1) || "";
          return filename
            .split(".")
            .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
            .filter(Boolean)
            .join(".")
            .replace(/\./g, " dot ");
        }
        // other URLs
        return url.hostname
          .split(".")
          .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
          .join(".")
          .replace(/\./g, " dot ");
      });
      if (newValue) urlsTokens.push({ value: newValue, position: token.position });
    }

    // 8. Strip any unknown punctuation (punctuation not in PAUSE_PUNCT or EXPANDED_PUNCT)
    const strippedTokens: SpeechToken[] = [];
    for (const token of urlsTokens) {
      const value = token.value.replace(PUNCT_RE, (match) => (KNOWN_PUNCT.has(match) ? match : ""));
      if (value) strippedTokens.push({ ...token, value });
    }

    // 9. Explode tokens by whitespace
    const explodedTokens: SpeechToken[] = [];
    for (const token of strippedTokens) {
      explodedTokens.push(...explodeTokenByWhitespaces(token));
    }

    // 10. Filter out consecutive "\n" tokens (max. 2), and consecutive whitespaces (max. 1)
    const filteredTokens: SpeechToken[] = [];
    let consecutiveBreaks = 0;
    for (const token of explodedTokens) {
      // - break
      if (token.value === "\n") {
        consecutiveBreaks++;
        // Push break as-is if there are less than 2 consecutive breaks
        if (consecutiveBreaks <= 2) filteredTokens.push(token);
        // Else, extend the last break's end offset
        else {
          const lastToken = filteredTokens.at(-1);
          if (lastToken) lastToken.position.endsAt = token.position.endsAt;
        }
      }
      // - other token
      else {
        // Reset consecutive breaks counter
        consecutiveBreaks = 0;

        // Remove consecutive whitespaces and tabs
        const newValue = token.value.replace(/[ \t]+/g, " ");
        token.value = newValue;

        filteredTokens.push(token);
      }
    }

    // Return the tokens
    return op.success(filteredTokens);
  }
}

export const speechTokenizer = new SpeechTokenizer();
