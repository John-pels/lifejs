// biome-ignore-all lint/suspicious/noMisplacedAssertion: _

import type Mdast from "mdast";
import { describe, expect, it } from "vitest";
import { markdownFromTree, markdownToTree } from "../tree";

function assertInterrupted(node: unknown, expectedAuthor: "user" | "agent") {
  const interrupted = node as Mdast.LifeInterrupted;
  expect(interrupted.type).toBe("lifeInterrupted");
  expect(interrupted.author).toBe(expectedAuthor);
}

describe("interruptedSequenceFromMarkdown", () => {
  describe("basic interrupted sequences", () => {
    it("should parse [Interrupted by user]", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.children).toHaveLength(1);
      assertInterrupted(paragraph.children[0], "user");
    });

    it("should parse [Interrupted by agent]", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by agent]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.children).toHaveLength(1);
      assertInterrupted(paragraph.children[0], "agent");
    });
  });

  describe("interrupted sequences with surrounding text", () => {
    it("should parse interrupted sequence with text before", () => {
      const [errTree, tree] = markdownToTree("Hello [Interrupted by user]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(2);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Hello " });
      assertInterrupted(paragraph.children[1], "user");
    });

    it("should parse interrupted sequence with text after", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by agent] world");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(2);
      assertInterrupted(paragraph.children[0], "agent");
      expect(paragraph.children[1]).toMatchObject({ type: "text", value: " world" });
    });

    it("should parse interrupted sequence with text before and after", () => {
      const [errTree, tree] = markdownToTree("Hello [Interrupted by user] world");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(3);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Hello " });
      assertInterrupted(paragraph.children[1], "user");
      expect(paragraph.children[2]).toMatchObject({ type: "text", value: " world" });
    });
  });

  describe("multiple interrupted sequences", () => {
    it("should parse multiple interrupted sequences", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user] [Interrupted by agent]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(3);
      expect(paragraph.children[0]).toMatchObject({ type: "lifeInterrupted", author: "user" });
      expect(paragraph.children[1]).toMatchObject({ type: "text", value: " " });
      expect(paragraph.children[2]).toMatchObject({ type: "lifeInterrupted", author: "agent" });
    });

    it("should parse multiple interrupted sequences with text", () => {
      const [errTree, tree] = markdownToTree(
        "Start [Interrupted by user] middle [Interrupted by agent] end",
      );
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(5);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Start " });
      expect(paragraph.children[1]).toMatchObject({ type: "lifeInterrupted", author: "user" });
      expect(paragraph.children[2]).toMatchObject({ type: "text", value: " middle " });
      expect(paragraph.children[3]).toMatchObject({ type: "lifeInterrupted", author: "agent" });
      expect(paragraph.children[4]).toMatchObject({ type: "text", value: " end" });
    });
  });

  describe("edge cases", () => {
    it("should handle text without interrupted sequences", () => {
      const [errTree, tree] = markdownToTree("Hello world");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Hello world" });
    });

    it("should handle empty text", () => {
      const [errTree, tree] = markdownToTree("");
      if (errTree) throw errTree;
      expect(tree.children).toHaveLength(0);
    });

    it("should handle text with similar but invalid patterns", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by invalid]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({
        type: "text",
        value: "[Interrupted by invalid]",
      });
    });

    it("should handle text with partial pattern", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "[Interrupted by" });
    });

    it("should handle text with case-sensitive pattern", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by User]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "[Interrupted by User]" });
    });

    it("should handle interrupted sequences in nested structures", () => {
      const [errTree, tree] = markdownToTree("**Bold [Interrupted by user] text**");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      const strong = paragraph.children[0];
      if (!(strong && "children" in strong)) throw new Error("Shouldn't happen.");
      expect(strong.type).toBe("strong");
      expect(strong.children).toHaveLength(3);
      expect(strong.children[0]).toMatchObject({ type: "text", value: "Bold " });
      assertInterrupted(strong.children[1], "user");
      expect(strong.children[2]).toMatchObject({ type: "text", value: " text" });
    });

    it("should handle consecutive interrupted sequences", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user][Interrupted by agent]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(2);
      assertInterrupted(paragraph.children[0], "user");
      assertInterrupted(paragraph.children[1], "agent");
    });

    it("should handle interrupted sequence at start of line", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user]\n\nNext line");
      if (errTree) throw errTree;
      const paragraph1 = tree.children[0];
      if (!(paragraph1 && "children" in paragraph1)) throw new Error("Shouldn't happen.");
      assertInterrupted(paragraph1.children[0], "user");
      const paragraph2 = tree.children[1];
      if (!(paragraph2 && "children" in paragraph2)) {
        throw new Error("Expected second paragraph with children");
      }
      expect(paragraph2.children[0]).toMatchObject({ type: "text", value: "Next line" });
    });

    it("should handle whitespace variations in pattern", () => {
      // Pattern should be case-sensitive and exact - whitespace variations should not match
      const [errTree, tree] = markdownToTree("[ Interrupted by user ]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({
        type: "text",
        value: "[ Interrupted by user ]",
      });
    });

    it("should handle missing closing bracket", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({
        type: "text",
        value: "[Interrupted by user",
      });
    });

    it("should handle extra brackets", () => {
      const [errTree, tree] = markdownToTree("[[Interrupted by user]]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      // The regex matches [Interrupted by user] even inside [[...]], creating 3 children
      expect(paragraph.children).toHaveLength(3);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "[" });
      assertInterrupted(paragraph.children[1], "user");
      expect(paragraph.children[2]).toMatchObject({ type: "text", value: "]" });
    });

    it("should not parse interrupted sequences in code blocks", () => {
      const [errTree, tree] = markdownToTree("```\n[Interrupted by user]\n```");
      if (errTree) throw errTree;
      const codeBlock = tree.children[0];
      if (!codeBlock || codeBlock.type !== "code") {
        throw new Error("Expected code block");
      }
      // Code blocks have a value property, not children - the interrupted sequence should remain as plain text
      expect((codeBlock as { value?: string }).value).toContain("[Interrupted by user]");
    });

    it("should handle interrupted sequence with trailing whitespace", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user] ");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      // The trailing space is included in the text node that contains the interrupted sequence
      // After parsing, it becomes a separate text node
      expect(paragraph.children.length).toBeGreaterThanOrEqual(1);
      // The first child should be the interrupted node
      assertInterrupted(paragraph.children[0], "user");
      // If there's a second child, it should be the trailing space
      if (paragraph.children.length > 1) {
        expect(paragraph.children[1]).toMatchObject({ type: "text", value: " " });
      }
    });

    it("should handle interrupted sequence with leading whitespace", () => {
      const [errTree, tree] = markdownToTree(" [Interrupted by user]");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      // The leading space becomes a separate text node before the interrupted node
      expect(paragraph.children.length).toBeGreaterThanOrEqual(1);
      // Check if first child is text (leading space) or interrupted
      const firstChild = paragraph.children[0];
      if (!firstChild) {
        throw new Error("Expected first child");
      }
      if (firstChild.type === "text") {
        expect(firstChild).toMatchObject({ type: "text", value: " " });
        const secondChild = paragraph.children[1];
        if (!secondChild) {
          throw new Error("Expected second child");
        }
        assertInterrupted(secondChild, "user");
      } else {
        assertInterrupted(firstChild, "user");
      }
    });
  });
});

describe("interruptedMarkerToMarkdown", () => {
  describe("basic interrupted sequences", () => {
    it("should convert interrupted node back to [Interrupted by user]", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user]");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("[Interrupted by user]");
    });

    it("should convert interrupted node back to [Interrupted by agent]", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by agent]");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("[Interrupted by agent]");
    });
  });

  describe("interrupted sequences with surrounding text", () => {
    it("should convert interrupted sequence with text before", () => {
      const [errTree, tree] = markdownToTree("Hello [Interrupted by user]");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("Hello [Interrupted by user]");
    });

    it("should convert interrupted sequence with text after", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by agent] world");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("[Interrupted by agent] world");
    });

    it("should convert interrupted sequence with text before and after", () => {
      const [errTree, tree] = markdownToTree("Hello [Interrupted by user] world");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("Hello [Interrupted by user] world");
    });
  });

  describe("multiple interrupted sequences", () => {
    it("should convert multiple interrupted sequences", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user] [Interrupted by agent]");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("[Interrupted by user] [Interrupted by agent]");
    });

    it("should convert multiple interrupted sequences with text", () => {
      const [errTree, tree] = markdownToTree(
        "Start [Interrupted by user] middle [Interrupted by agent] end",
      );
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("Start [Interrupted by user] middle [Interrupted by agent] end");
    });
  });

  describe("round-trip conversion", () => {
    it("should preserve interrupted sequences through round-trip conversion", () => {
      const original = "Hello [Interrupted by user] world [Interrupted by agent] end";
      const [errTree1, tree1] = markdownToTree(original);
      if (errTree1) throw errTree1;
      const [errMarkdown1, markdown1] = markdownFromTree(tree1);
      if (errMarkdown1) throw errMarkdown1;
      const [errTree2, tree2] = markdownToTree(markdown1.trim());
      if (errTree2) throw errTree2;
      const [errMarkdown2, markdown2] = markdownFromTree(tree2);
      if (errMarkdown2) throw errMarkdown2;
      expect(markdown2.trim()).toBe(original);
    });

    it("should preserve interrupted sequences in nested structures", () => {
      const original = "**Bold [Interrupted by user] text**";
      const [errTree1, tree1] = markdownToTree(original);
      if (errTree1) throw errTree1;
      const [errMarkdown1, markdown1] = markdownFromTree(tree1);
      if (errMarkdown1) throw errMarkdown1;
      expect(markdown1.trim()).toBe(original);
    });

    it("should preserve consecutive interrupted sequences", () => {
      const original = "[Interrupted by user][Interrupted by agent]";
      const [errTree1, tree1] = markdownToTree(original);
      if (errTree1) throw errTree1;
      const [errMarkdown1, markdown1] = markdownFromTree(tree1);
      if (errMarkdown1) throw errMarkdown1;
      expect(markdown1.trim()).toBe(original);
    });

    it("should preserve interrupted sequences with multiple paragraphs", () => {
      const original = "[Interrupted by user]\n\nNext paragraph";
      const [errTree1, tree1] = markdownToTree(original);
      if (errTree1) throw errTree1;
      const [errMarkdown1, markdown1] = markdownFromTree(tree1);
      if (errMarkdown1) throw errMarkdown1;
      expect(markdown1.trim()).toBe(original);
    });
  });

  describe("edge cases", () => {
    it("should handle interrupted sequence at start of paragraph", () => {
      const [errTree, tree] = markdownToTree("[Interrupted by user]");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("[Interrupted by user]");
    });

    it("should handle interrupted sequence at end of paragraph", () => {
      const [errTree, tree] = markdownToTree("Text [Interrupted by agent]");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("Text [Interrupted by agent]");
    });

    it("should handle interrupted sequences with whitespace", () => {
      const [errTree, tree] = markdownToTree("Start [Interrupted by user] end");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("Start [Interrupted by user] end");
    });
  });
});
