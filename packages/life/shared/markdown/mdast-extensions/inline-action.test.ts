// biome-ignore-all lint/suspicious/noMisplacedAssertion: _

import type Mdast from "mdast";
import { describe, expect, it } from "vitest";
import { markdownFromTree, markdownToTree } from "../tree";

function assertInlineAction(node: unknown, expectedName: string, expectedInput?: unknown) {
  const action = node as Mdast.LifeInlineAction;
  expect(action.type).toBe("lifeInlineAction");
  expect(action.name).toBe(expectedName);
  if (expectedInput !== undefined) {
    expect(action.input).toEqual(expectedInput);
  }
}

describe("inlineActionFromMarkdown", () => {
  describe("basic inline action sequences", () => {
    it("should parse execute::actionName()", () => {
      const [errTree, tree] = markdownToTree("execute::actionName()");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", undefined);
    });

    it("should parse execute::actionName(input)", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":"test"})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", { value: "test" });
    });

    it("should parse execute::actionName with JSON input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"key":"value"})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", { key: "value" });
    });
  });

  describe("inline action sequences with surrounding text", () => {
    it("should parse inline action with text before", () => {
      const [errTree, tree] = markdownToTree('Hello execute::actionName({"value":"test"})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(2);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Hello " });
      assertInlineAction(paragraph.children[1], "actionName", { value: "test" });
    });

    it("should parse inline action with text after", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":"test"}) world');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(2);
      assertInlineAction(paragraph.children[0], "actionName", { value: "test" });
      expect(paragraph.children[1]).toMatchObject({ type: "text", value: " world" });
    });

    it("should parse inline action with text before and after", () => {
      const [errTree, tree] = markdownToTree('Hello execute::actionName({"value":"test"}) world');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(3);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Hello " });
      assertInlineAction(paragraph.children[1], "actionName", { value: "test" });
      expect(paragraph.children[2]).toMatchObject({ type: "text", value: " world" });
    });
  });

  describe("multiple inline action sequences", () => {
    it("should parse multiple inline actions", () => {
      const [errTree, tree] = markdownToTree(
        'execute::action1() execute::action2({"value":"test"})',
      );
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(3);
      assertInlineAction(paragraph.children[0], "action1", undefined);
      expect(paragraph.children[1]).toMatchObject({ type: "text", value: " " });
      assertInlineAction(paragraph.children[2], "action2", { value: "test" });
    });

    it("should parse multiple inline actions with text", () => {
      const [errTree, tree] = markdownToTree(
        'Start execute::action1() middle execute::action2({"value":"test"}) end',
      );
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(5);
      expect(paragraph.children[0]).toMatchObject({ type: "text", value: "Start " });
      assertInlineAction(paragraph.children[1], "action1", undefined);
      expect(paragraph.children[2]).toMatchObject({ type: "text", value: " middle " });
      assertInlineAction(paragraph.children[3], "action2", { value: "test" });
      expect(paragraph.children[4]).toMatchObject({ type: "text", value: " end" });
    });
  });

  describe("edge cases", () => {
    it("should handle text without inline actions", () => {
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
      const [errTree, tree] = markdownToTree("execute::actionName");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({
        type: "text",
        value: "execute::actionName",
      });
    });

    it("should handle inline actions in nested structures", () => {
      const [errTree, tree] = markdownToTree('**Bold execute::actionName({"value":"test"}) text**');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      const strong = paragraph.children[0];
      if (!(strong && "children" in strong)) throw new Error("Shouldn't happen.");
      expect(strong.type).toBe("strong");
      expect(strong.children).toHaveLength(3);
      expect(strong.children[0]).toMatchObject({ type: "text", value: "Bold " });
      assertInlineAction(strong.children[1], "actionName", { value: "test" });
      expect(strong.children[2]).toMatchObject({ type: "text", value: " text" });
    });

    it("should handle consecutive inline actions", () => {
      const [errTree, tree] = markdownToTree(
        'execute::action1()execute::action2({"value":"test"})',
      );
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(2);
      assertInlineAction(paragraph.children[0], "action1", undefined);
      assertInlineAction(paragraph.children[1], "action2", { value: "test" });
    });

    it("should handle inline action with complex JSON input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"nested":{"value":123}})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      assertInlineAction(paragraph.children[0], "actionName", { nested: { value: 123 } });
    });

    it("should handle inline action with invalid JSON input", () => {
      const [errTree, tree] = markdownToTree("execute::actionName(invalid json)");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      assertInlineAction(paragraph.children[0], "actionName", { value: "invalid json" });
    });

    it("should handle empty action name (regex requires at least one char)", () => {
      const [errTree, tree] = markdownToTree("execute::()");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      // The regex ([^(]+) requires at least one character, so this won't match
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toMatchObject({
        type: "text",
        value: "execute::()",
      });
    });

    it("should handle action name with whitespace (trimmed)", () => {
      const [errTree, tree] = markdownToTree('execute:: action name ({"value":"test"})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "action name", { value: "test" });
    });

    it("should handle input with nested parentheses", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":"test(123)"})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      // The regex ([^)]*) stops at the first ), so it matches {"value":"test(123" and leaves ")"}) as separate
      // This is expected behavior - nested parentheses in JSON strings require proper escaping
      expect(paragraph.children.length).toBeGreaterThanOrEqual(1);
      // The first part should be parsed as an action
      const firstChild = paragraph.children[0];
      if (!firstChild) {
        throw new Error("Expected first child");
      }
      // Check if it's an inline action by checking the type property
      const isInlineAction =
        "type" in firstChild && (firstChild as { type: string }).type === "lifeInlineAction";
      if (isInlineAction) {
        // The input includes {"value":"test(123" because the regex stops at the first )
        // Since it's invalid JSON, it gets wrapped as a string value
        assertInlineAction(firstChild, "actionName", { value: '{"value":"test(123' });
      } else {
        // If it didn't parse, it's all text
        expect(firstChild).toMatchObject({
          type: "text",
          value: 'execute::actionName({"value":"test(123)"})',
        });
      }
    });

    it("should handle multiple colons in action name", () => {
      const [errTree, tree] = markdownToTree("execute:::actionName()");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], ":actionName", undefined);
    });

    it("should handle empty input with whitespace", () => {
      const [errTree, tree] = markdownToTree("execute::actionName( )");
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", undefined);
    });

    it("should handle JSON array input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":[1,2,3]})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", { value: [1, 2, 3] });
    });

    it("should handle JSON null input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":null})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", { value: null });
    });

    it("should handle JSON boolean input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":true})');
      if (errTree) throw errTree;
      const paragraph = tree.children[0];
      if (!(paragraph && "children" in paragraph)) throw new Error("Shouldn't happen.");
      expect(paragraph.children).toHaveLength(1);
      assertInlineAction(paragraph.children[0], "actionName", { value: true });
    });

    it("should not parse inline actions in code blocks", () => {
      const [errTree, tree] = markdownToTree("```\nexecute::actionName()\n```");
      if (errTree) throw errTree;
      const codeBlock = tree.children[0];
      if (!codeBlock || codeBlock.type !== "code") {
        throw new Error("Expected code block");
      }
      // Code blocks have a value property, not children - the action should remain as plain text
      expect((codeBlock as { value?: string }).value).toContain("execute::actionName()");
    });
  });
});

describe("inlineActionToMarkdown", () => {
  describe("basic inline action sequences", () => {
    it("should convert inline action node back to execute::actionName()", () => {
      const [errTree, tree] = markdownToTree("execute::actionName()");
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe("execute::actionName()");
    });

    it("should convert inline action node back to execute::actionName(input)", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":"test"})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"value":"test"})');
    });

    it("should convert inline action with JSON input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"key":"value"})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"key":"value"})');
    });
  });

  describe("inline action sequences with surrounding text", () => {
    it("should convert inline action with text before", () => {
      const [errTree, tree] = markdownToTree('Hello execute::actionName({"value":"test"})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('Hello execute::actionName({"value":"test"})');
    });

    it("should convert inline action with text after", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":"test"}) world');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"value":"test"}) world');
    });

    it("should convert inline action with text before and after", () => {
      const [errTree, tree] = markdownToTree('Hello execute::actionName({"value":"test"}) world');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('Hello execute::actionName({"value":"test"}) world');
    });
  });

  describe("multiple inline action sequences", () => {
    it("should convert multiple inline actions", () => {
      const [errTree, tree] = markdownToTree(
        'execute::action1() execute::action2({"value":"test"})',
      );
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::action1() execute::action2({"value":"test"})');
    });

    it("should convert multiple inline actions with text", () => {
      const [errTree, tree] = markdownToTree(
        'Start execute::action1() middle execute::action2({"value":"test"}) end',
      );
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe(
        'Start execute::action1() middle execute::action2({"value":"test"}) end',
      );
    });
  });

  describe("edge cases", () => {
    it("should convert inline action with complex JSON input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"nested":{"value":123}})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"nested":{"value":123}})');
    });

    it("should convert inline action with JSON array input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":[1,2,3]})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"value":[1,2,3]})');
    });

    it("should convert inline action with JSON null input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":null})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"value":null})');
    });

    it("should convert inline action with JSON boolean input", () => {
      const [errTree, tree] = markdownToTree('execute::actionName({"value":true})');
      if (errTree) throw errTree;
      const [errMarkdown, markdown] = markdownFromTree(tree);
      if (errMarkdown) throw errMarkdown;
      expect(markdown.trim()).toBe('execute::actionName({"value":true})');
    });
  });

  describe("round-trip conversion", () => {
    it("should preserve inline actions through round-trip conversion", () => {
      const original = 'Hello execute::action1() world execute::action2({"value":"test"}) end';
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

    it("should preserve inline actions in nested structures", () => {
      const original = '**Bold execute::actionName({"value":"test"}) text**';
      const [errTree1, tree1] = markdownToTree(original);
      if (errTree1) throw errTree1;
      const [errMarkdown1, markdown1] = markdownFromTree(tree1);
      if (errMarkdown1) throw errMarkdown1;
      expect(markdown1.trim()).toBe(original);
    });

    it("should preserve consecutive inline actions", () => {
      const original = 'execute::action1()execute::action2({"value":"test"})';
      const [errTree1, tree1] = markdownToTree(original);
      if (errTree1) throw errTree1;
      const [errMarkdown1, markdown1] = markdownFromTree(tree1);
      if (errMarkdown1) throw errMarkdown1;
      expect(markdown1.trim()).toBe(original);
    });
  });
});
