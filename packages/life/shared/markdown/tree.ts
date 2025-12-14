import type Mdast from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown,
} from "mdast-util-gfm-autolink-literal";
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from "mdast-util-gfm-footnote";
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown,
} from "mdast-util-gfm-task-list-item";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { mdxJsxFromMarkdown, mdxJsxToMarkdown } from "mdast-util-mdx-jsx";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import { math } from "micromark-extension-math";
import { mdxJsx } from "micromark-extension-mdx-jsx";
import * as op from "@/shared/operation";
import { inlineActionFromMarkdown, inlineActionToMarkdown } from "./mdast-extensions/inline-action";
import {
  interruptedMarkerFromMarkdown,
  interruptedMarkerToMarkdown,
} from "./mdast-extensions/interrupted";
import { keyFromMarkdown } from "./mdast-extensions/key";

/**
 * Convert a Markdown string to a Markdown tree
 * @param content - The Markdown string to convert
 * @returns The Markdown tree
 */
export const markdownToTree = (content: string, withAutolinks = false) =>
  op.attempt(() =>
    fromMarkdown(content, "utf-8", {
      extensions: [
        math({ singleDollarTextMath: false }),
        mdxJsx(),
        ...(withAutolinks ? [gfmAutolinkLiteral()] : []),
        gfmFootnote(),
        gfmStrikethrough(),
        gfmTable(),
        gfmTaskListItem(),
      ],
      mdastExtensions: [
        interruptedMarkerFromMarkdown,
        inlineActionFromMarkdown,
        mdxJsxFromMarkdown(),
        ...(withAutolinks ? [gfmAutolinkLiteralFromMarkdown()] : []),
        gfmFootnoteFromMarkdown(),
        gfmStrikethroughFromMarkdown(),
        gfmTableFromMarkdown(),
        gfmTaskListItemFromMarkdown(),
        mathFromMarkdown(),
        keyFromMarkdown,
      ],
    }),
  );

/**
 * Convert a Markdown tree to a Markdown string
 * @param tree - The Markdown tree to convert
 * @returns The Markdown string
 */
export const markdownFromTree = (tree: Mdast.Root) =>
  op.attempt(() =>
    toMarkdown(tree, {
      extensions: [
        interruptedMarkerToMarkdown,
        inlineActionToMarkdown,
        mdxJsxToMarkdown(),
        gfmAutolinkLiteralToMarkdown(),
        gfmFootnoteToMarkdown(),
        gfmStrikethroughToMarkdown(),
        gfmTableToMarkdown(),
        gfmTaskListItemToMarkdown(),
        mathToMarkdown(),
      ],
    }),
  );
