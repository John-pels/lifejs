import { describe, expect, it } from "vitest";
import { markdownToTree } from "../tree";

describe("keyFromMarkdown", () => {
  it("should assign sequential keys to sibling nodes", () => {
    const [errTree, tree] = markdownToTree(
      "First paragraph\n\nSecond paragraph\n\nThird paragraph",
    );
    if (errTree) throw errTree;
    expect(tree.children[0]?.key).toBe(0);
    expect(tree.children[1]?.key).toBe(1);
    expect(tree.children[2]?.key).toBe(2);
  });

  it("should assign keys to nested children", () => {
    const [errTree, tree] = markdownToTree("**Bold** and *italic*");
    if (errTree) throw errTree;
    const paragraph = tree.children[0];
    if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
    expect(paragraph.key).toBe(0);
    expect(paragraph.children[0]?.key).toBe(0);
    expect(paragraph.children[1]?.key).toBe(1);
    expect(paragraph.children[2]?.key).toBe(2);
  });
});
