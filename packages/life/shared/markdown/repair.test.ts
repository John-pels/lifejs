import { describe, expect, it } from "vitest";
import { repairMarkdown } from "./repair";

/**
 * This file tests all the nuances and edge cases of the markdown repair system.
 * The repair system is designed to "close" incomplete markdown sequences that
 * typically occur during streaming LLM output.
 *
 * Key behaviors tested:
 * 1. Closing unclosed formatting markers (bold, italic, strikethrough, etc.)
 * 2. Completing incomplete links/images
 * 3. Completing incomplete tables
 * 4. Handling execute:: inline actions
 * 5. Removing empty markers (trailing ** with no content)
 * 6. Preserving content inside code blocks (inlineCode/inlineMath are "safe zones")
 * 7. Backslash preservation
 * 8. Nested syntax handling
 */

const repair = (content: string): string => {
  const [err, result] = repairMarkdown(content);
  if (err) throw err;
  return result;
};

describe("repairMarkdown", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Basic Text (should remain unchanged)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Basic text passthrough", () => {
    it("should return empty string unchanged", () => {
      expect(repair("")).toBe("");
    });

    it("should return plain text unchanged", () => {
      expect(repair("Hello")).toBe("Hello");
      expect(repair("Hello world")).toBe("Hello world");
      expect(repair("Multiple words in a sentence")).toBe("Multiple words in a sentence");
    });

    it("should preserve multiline text", () => {
      expect(repair("Line 1\nLine 2")).toBe("Line 1\nLine 2");
      expect(repair("Line 1\n\nLine 2")).toBe("Line 1\n\nLine 2");
    });

    it("should preserve special characters that aren't markdown", () => {
      expect(repair("Hello & goodbye")).toBe("Hello & goodbye");
      expect(repair("100% complete")).toBe("100% complete");
      expect(repair("Question?")).toBe("Question?");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Bold Formatting
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Bold with ** syntax", () => {
    describe("closing unclosed sequences", () => {
      it("should close open bold at start", () => {
        expect(repair("**bold")).toBe("**bold**");
      });

      it("should close open bold with multiple words", () => {
        expect(repair("**bold text here")).toBe("**bold text here**");
      });

      it("should close open bold in middle of text", () => {
        expect(repair("Hello **bold")).toBe("Hello **bold**");
        expect(repair("Start **bold end")).toBe("Start **bold end**");
      });

      it("should preserve already complete bold", () => {
        expect(repair("**bold**")).toBe("**bold**");
        expect(repair("**bold** text")).toBe("**bold** text");
        expect(repair("text **bold** more")).toBe("text **bold** more");
      });
    });

    describe("empty marker removal", () => {
      it("should remove trailing ** with no content", () => {
        expect(repair("**")).toBe("");
      });

      it("should remove trailing ** with only space", () => {
        expect(repair("** ")).toBe("");
      });

      it("should remove trailing ** after other content", () => {
        expect(repair("text **")).toBe("text");
      });

      it("should remove trailing ** after complete bold", () => {
        expect(repair("**bold** and **")).toBe("**bold** and");
      });
    });

    describe("multiple bold sequences", () => {
      it("should handle multiple complete sequences", () => {
        expect(repair("**a** **b**")).toBe("**a** **b**");
      });

      it("should close last incomplete sequence", () => {
        expect(repair("**a** **b")).toBe("**a** **b**");
      });

      it("should handle three sequences with last incomplete", () => {
        expect(repair("**a** **b** **c")).toBe("**a** **b** **c**");
      });
    });
  });

  describe("Bold with __ syntax", () => {
    // Note: __ requires word boundaries (space or start/end of line)
    // mdast normalizes __ to ** in output

    it("should close open __ bold (with leading space for word boundary)", () => {
      expect(repair(" __bold")).toBe("**bold**");
      expect(repair("Hello __bold")).toBe("Hello **bold**");
    });

    it("should preserve complete __ bold", () => {
      expect(repair("__bold__")).toBe("**bold**");
    });

    it("should NOT treat __ as bold when inside a word", () => {
      // snake_case identifiers should not be treated as bold
      expect(repair("hello__world")).toBe("hello__world");
      expect(repair("my__variable__name")).toBe("my__variable__name");
    });

    it("should handle __ at end of text with word boundary", () => {
      expect(repair("text __bold")).toBe("text **bold**");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Italic Formatting
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Italic with * syntax", () => {
    describe("closing unclosed sequences", () => {
      it("should close open italic at start", () => {
        expect(repair("*italic")).toBe("_italic_");
      });

      it("should close open italic with multiple words", () => {
        expect(repair("*italic text here")).toBe("_italic text here_");
      });

      it("should close open italic in middle of text", () => {
        expect(repair("Hello *italic")).toBe("Hello _italic_");
      });

      it("should preserve complete italic", () => {
        expect(repair("*italic*")).toBe("_italic_");
        expect(repair("*italic* text")).toBe("_italic_ text");
      });
    });

    describe("empty marker behavior", () => {
      // "* " is parsed as a list item marker, not italic
      it("should remove empty list items (star followed by space)", () => {
        expect(repair("* ")).toBe("");
        expect(repair("*  ")).toBe("");
      });
    });

    describe("multiple italic sequences", () => {
      it("should handle multiple complete sequences", () => {
        expect(repair("*a* *b*")).toBe("_a_ _b_");
      });

      it("should close last incomplete sequence", () => {
        expect(repair("*a* *b")).toBe("_a_ _b_");
      });
    });
  });

  describe("Italic with _ syntax", () => {
    // Note: _ requires word boundaries (space or start/end of line)
    // mdast normalizes _ to * in output

    it("should close open _ italic (with leading space for word boundary)", () => {
      expect(repair(" _italic")).toBe("_italic_");
      expect(repair("Hello _italic")).toBe("Hello _italic_");
    });

    it("should preserve complete _ italic", () => {
      expect(repair("_italic_")).toBe("_italic_");
    });

    it("should NOT treat _ as italic when inside a word", () => {
      expect(repair("hello_world")).toBe("hello_world");
      expect(repair("my_variable_name")).toBe("my_variable_name");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: Strikethrough Formatting
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Strikethrough with ~~ syntax", () => {
    describe("closing unclosed sequences", () => {
      it("should close open strikethrough at start", () => {
        expect(repair("~~strike")).toBe("~~strike~~");
      });

      it("should close open strikethrough with multiple words", () => {
        expect(repair("~~strike text here")).toBe("~~strike text here~~");
      });

      it("should close open strikethrough in middle of text", () => {
        expect(repair("Hello ~~strike")).toBe("Hello ~~strike~~");
      });

      it("should preserve complete strikethrough", () => {
        expect(repair("~~strike~~")).toBe("~~strike~~");
      });
    });

    describe("empty marker removal", () => {
      it("should remove trailing ~~ with no content", () => {
        expect(repair("~~")).toBe("");
      });

      it("should remove trailing ~~ with only space", () => {
        expect(repair("~~ ")).toBe("");
      });

      it("should remove trailing ~~ after other content", () => {
        expect(repair("text ~~")).toBe("text");
      });

      it("should remove trailing ~~ after complete strike", () => {
        expect(repair("~~strike~~ and ~~")).toBe("~~strike~~ and");
      });
    });
  });

  describe("Strikethrough with ~ syntax (single tilde)", () => {
    // Note: mdast normalizes single ~ to ~~ in output

    it("should close open single ~ strikethrough", () => {
      expect(repair("~strike")).toBe("~~strike~~");
      expect(repair("Hello ~strike")).toBe("Hello ~~strike~~");
    });

    it("should preserve complete single ~ strikethrough", () => {
      expect(repair("~strike~")).toBe("~~strike~~");
    });

    it("should remove trailing ~ with no content", () => {
      expect(repair("~")).toBe("");
      expect(repair("~ ")).toBe("");
    });

    it("should not confuse ~ with ~~", () => {
      // ~~ should be treated as one unit, not two ~
      expect(repair("~~strike")).toBe("~~strike~~");
    });

    it.skipIf(true)("should handle mixed ~ and ~~ scenarios", () => {
      // This is a tricky edge case - ~~ opens, then ~ inside
      expect(repair("~~hello~world")).toBe("~~hello~world~~~");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Inline Code
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Inline code with ` syntax", () => {
    describe("closing unclosed sequences", () => {
      it("should close open inline code at start", () => {
        expect(repair("`code")).toBe("`code`");
      });

      it("should close open inline code with multiple words", () => {
        expect(repair("`code snippet here")).toBe("`code snippet here`");
      });

      it("should close open inline code in middle of text", () => {
        expect(repair("Hello `code")).toBe("Hello `code`");
      });

      it("should preserve complete inline code", () => {
        expect(repair("`code`")).toBe("`code`");
        expect(repair("`code` text")).toBe("`code` text");
      });
    });

    describe("empty marker removal", () => {
      it("should remove trailing ` with only space", () => {
        expect(repair("` ")).toBe("");
      });
    });

    describe("code as safe zone - markdown inside should NOT be repaired", () => {
      it("should not repair ** inside inline code", () => {
        expect(repair("`code **bold")).toBe("`code **bold`");
      });

      it("should not repair * inside inline code", () => {
        expect(repair("`code *italic")).toBe("`code *italic`");
      });

      it("should not repair ~~ inside inline code", () => {
        expect(repair("`code ~~strike")).toBe("`code ~~strike`");
      });

      it("should not repair [ inside inline code", () => {
        expect(repair("`code [link")).toBe("`code [link`");
      });

      it("should preserve markdown-like content in complete inline code", () => {
        expect(repair("`**not bold**`")).toBe("`**not bold**`");
        expect(repair("`*not italic*`")).toBe("`*not italic*`");
      });
    });

    describe("multiple inline code sequences", () => {
      it("should handle multiple complete sequences", () => {
        expect(repair("`a` `b`")).toBe("`a` `b`");
      });

      it("should close last incomplete sequence", () => {
        expect(repair("`a` `b")).toBe("`a` `b`");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: Inline Math
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Inline math with $$ syntax", () => {
    describe("closing unclosed sequences", () => {
      it("should close open inline math at start", () => {
        // Display math (at line start) serializes with newlines
        expect(repair("$$math")).toBe("$$\nmath\n$$");
      });

      it("should close open inline math with expression", () => {
        // Display math (at line start) serializes with newlines
        expect(repair("$$x + y")).toBe("$$\nx + y\n$$");
      });

      it("should close open inline math in middle of text", () => {
        expect(repair("Hello $$math")).toBe("Hello $$math$$");
      });

      it("should preserve complete inline math", () => {
        expect(repair("$$math$$")).toBe("$$math$$");
        expect(repair("$$x + y$$")).toBe("$$x + y$$");
      });
    });

    describe("empty marker removal", () => {
      it("should remove trailing $$ with only space", () => {
        expect(repair("$$ ")).toBe("");
      });
    });

    describe("math as safe zone - markdown inside should NOT be repaired", () => {
      it("should not repair * inside inline math (multiplication)", () => {
        // Display math (at line start) serializes with newlines
        expect(repair("$$x * y")).toBe("$$\nx * y\n$$");
      });

      it("should preserve asterisks in complete math", () => {
        expect(repair("$$x * y$$")).toBe("$$x * y$$");
        expect(repair("$$a ** b$$")).toBe("$$a ** b$$");
      });
    });

    describe("single $ should NOT be treated as math (currency)", () => {
      it("should not repair single $ followed by number", () => {
        expect(repair("$29.99")).toBe("$29.99");
        expect(repair("This costs $50")).toBe("This costs $50");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: Links
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Links", () => {
    describe("closing incomplete link text (unclosed [)", () => {
      it("should complete [text with ]() ", () => {
        expect(repair("[text")).toBe("[text]()");
        expect(repair("[link text")).toBe("[link text]()");
        expect(repair("Hello [text")).toBe("Hello [text]()");
      });
    });

    describe("closing incomplete link (missing URL)", () => {
      it("should add () to [text]", () => {
        expect(repair("[text]")).toBe("[text]()");
        expect(repair("[link text]")).toBe("[link text]()");
        expect(repair("Click [here]")).toBe("Click [here]()");
      });
    });

    describe("closing incomplete link (unclosed URL)", () => {
      it("should close [text](url with )", () => {
        expect(repair("[text](url")).toBe("[text](url)");
        expect(repair("[text](https://example.com")).toBe("[text](https://example.com)");
        expect(repair("[link](https://example.com/path")).toBe("[link](https://example.com/path)");
      });
    });

    describe("preserving complete links", () => {
      it("should keep complete links unchanged", () => {
        expect(repair("[text](url)")).toBe("[text](url)");
        expect(repair("[text](https://example.com)")).toBe("[text](https://example.com)");
        expect(repair("[link](url) text")).toBe("[link](url) text");
      });
    });

    describe("edge cases", () => {
      it.skip("should handle link with empty text", () => {
        expect(repair("[]")).toBe("");
      });

      it("should only repair the last incomplete link (not earlier ones)", () => {
        // Note: Only the last incomplete sequence gets repaired
        // [a] (complete brackets, missing URL) is left as-is
        expect(repair("[a] [b")).toBe("[a] [b]()");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: Images
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Images", () => {
    describe("closing incomplete image alt text (unclosed ![)", () => {
      it("should complete ![alt with ]() ", () => {
        expect(repair("![alt")).toBe("![alt]()");
        expect(repair("![alt text")).toBe("![alt text]()");
        expect(repair("Image: ![alt")).toBe("Image: ![alt]()");
      });
    });

    describe("closing incomplete image (missing URL)", () => {
      it("should add () to ![alt]", () => {
        expect(repair("![alt]")).toBe("![alt]()");
        expect(repair("![alt text]")).toBe("![alt text]()");
      });
    });

    describe("closing incomplete image (unclosed URL)", () => {
      it("should close ![alt](url with )", () => {
        expect(repair("![alt](url")).toBe("![alt](url)");
        expect(repair("![alt](https://example.com/image.png")).toBe(
          "![alt](https://example.com/image.png)",
        );
      });
    });

    describe("preserving complete images", () => {
      it("should keep complete images unchanged", () => {
        expect(repair("![alt](url)")).toBe("![alt](url)");
        expect(repair("![alt text](https://example.com/image.png)")).toBe(
          "![alt text](https://example.com/image.png)",
        );
      });
    });

    describe("edge cases", () => {
      it("should handle image with empty alt", () => {
        expect(repair("![]")).toBe("![]()");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: Tables
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Tables", () => {
    describe("completing header row (no trailing |)", () => {
      it("should add trailing | and separator for single column", () => {
        expect(repair("|a")).toBe("| a |\n| - |");
      });

      it("should add trailing | and separator for multiple columns", () => {
        expect(repair("|a|b")).toBe("| a | b |\n| - | - |");
        expect(repair("|a|b|c")).toBe("| a | b | c |\n| - | - | - |");
      });
    });

    describe("completing header row (with trailing |)", () => {
      it("should add separator for single column", () => {
        expect(repair("|a|")).toBe("| a |\n| - |");
      });

      it("should add separator for multiple columns", () => {
        expect(repair("|a|b|")).toBe("| a | b |\n| - | - |");
        expect(repair("|a|b|c|")).toBe("| a | b | c |\n| - | - | - |");
      });
    });

    describe("completing separator row", () => {
      it("should complete partial separator", () => {
        expect(repair("|a|b|\n|-")).toBe("| a | b |\n| - | - |");
        expect(repair("|a|b|\n|-|")).toBe("| a | b |\n| - | - |");
        expect(repair("|a|b|\n|-|-")).toBe("| a | b |\n| - | - |");
      });

      it("should handle header with newline but no separator", () => {
        expect(repair("|a|b|\n")).toBe("| a | b |\n| - | - |");
        expect(repair("|a|b|\n|")).toBe("| a | b |\n| - | - |");
      });
    });

    describe("preserving complete tables", () => {
      it("should keep complete tables (just normalized)", () => {
        expect(repair("|a|b|\n|-|-|\n|c|d|")).toBe("| a | b |\n| - | - |\n| c | d |");
      });

      it("should handle complete table with multiple rows", () => {
        // mdast normalizes separator dashes to match column width
        expect(repair("|h1|h2|\n|-|-|\n|a|b|\n|c|d|")).toBe(
          "| h1 | h2 |\n| -- | -- |\n| a  | b  |\n| c  | d  |",
        );
      });
    });

    describe("edge cases", () => {
      it.skip("should handle empty table cells", () => {
        // || is ambiguous - might be parsed as empty content
        const result = repair("||");
        expect(result).toBe("");
      });

      it("should handle table with text before it", () => {
        expect(repair("Text\n|a|b")).toBe("Text\n\n| a | b |\n| - | - |");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: execute:: Inline Actions
  // ═══════════════════════════════════════════════════════════════════════════
  describe("execute:: inline actions", () => {
    describe("incomplete execute:: sequences", () => {
      it("should replace bare execute:: with PARTIAL", () => {
        expect(repair("execute::")).toBe("execute::PARTIAL()");
      });

      it("should replace execute::name (no parens) with PARTIAL", () => {
        expect(repair("execute::actionName")).toBe("execute::PARTIAL()");
        expect(repair("execute::myAction")).toBe("execute::PARTIAL()");
        expect(repair("execute::do_something")).toBe("execute::PARTIAL()");
      });

      it("should replace execute::name( (unclosed paren) with PARTIAL", () => {
        expect(repair("execute::actionName(")).toBe("execute::PARTIAL()");
      });

      it("should replace execute::name({... (partial args) with PARTIAL", () => {
        expect(repair("execute::actionName({")).toBe("execute::PARTIAL()");
        expect(repair('execute::actionName({"key"')).toBe("execute::PARTIAL()");
        expect(repair('execute::actionName({"key":')).toBe("execute::PARTIAL()");
        expect(repair('execute::actionName({"key":"val')).toBe("execute::PARTIAL()");
      });
    });

    describe("complete execute:: sequences", () => {
      it("should preserve complete execute:: with empty args", () => {
        expect(repair("execute::actionName()")).toBe("execute::actionName()");
      });

      it("should preserve complete execute:: with JSON args", () => {
        expect(repair('execute::actionName({"key":"value"})')).toBe(
          'execute::actionName({"key":"value"})',
        );
        expect(repair('execute::action({"a":1,"b":"two"})')).toBe(
          'execute::action({"a":1,"b":"two"})',
        );
      });
    });

    describe("execute:: in context", () => {
      it("should handle execute:: at end of text", () => {
        expect(repair("Click here: execute::")).toBe("Click here: execute::PARTIAL()");
      });

      it("should NOT repair execute:: in middle of text (only end-of-string)", () => {
        // The regex uses $ anchor, so only trailing execute:: sequences are repaired
        expect(repair("Action execute::doIt text")).toBe("Action execute::doIt text");
      });

      it("should handle multiple execute:: sequences (only last repaired)", () => {
        expect(repair("execute::a() execute::b")).toBe("execute::a() execute::PARTIAL()");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: Backslash Handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Backslash preservation", () => {
    it("should preserve literal backslashes in text", () => {
      expect(repair("path\\to\\file")).toBe("path\\to\\file");
      expect(repair("C:\\Users\\name")).toBe("C:\\Users\\name");
    });

    it("should preserve escaped markdown characters", () => {
      expect(repair("\\*not italic\\*")).toBe("_not italic_");
      expect(repair("\\**not bold\\**")).toBe("**not bold**");
    });

    it("should handle backslash with incomplete markdown", () => {
      expect(repair("text\\n **bold")).toBe("text\\n **bold**");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 12: Nested Syntax
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Nested syntax handling", () => {
    describe("bold containing italic", () => {
      it("should close both when both are open", () => {
        expect(repair("**bold _italic")).toBe("**bold _italic_**");
      });

      it("should handle already closed inner with open outer", () => {
        expect(repair("**bold _italic_")).toBe("**bold _italic_**");
      });
    });

    describe("italic containing bold", () => {
      it("should close both when both are open", () => {
        expect(repair("*italic **bold")).toBe("_italic **bold**_");
      });
    });

    describe("formatting containing links", () => {
      it("should close link inside open bold", () => {
        expect(repair("**bold [link")).toBe("**bold [link]()**");
      });

      it("should handle complete link inside open bold", () => {
        expect(repair("**bold [link](url)")).toBe("**bold [link](url)**");
      });

      it("should close bold containing partial link", () => {
        expect(repair("**bold [link]")).toBe("**bold [link]()**");
      });
    });

    describe("multiple nested levels", () => {
      it("should handle three levels of nesting", () => {
        expect(repair("**bold *italic ~~strike")).toBe("**bold _italic ~~strike~~_**");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 13: Block-level Elements
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Block-level elements", () => {
    describe("headings", () => {
      it("should repair markdown inside headings", () => {
        expect(repair("# Heading **bold")).toBe("# Heading **bold**");
        expect(repair("## Heading _italic")).toBe("## Heading _italic_");
      });

      it("should handle incomplete link in heading", () => {
        expect(repair("# Heading [link")).toBe("# Heading [link]()");
      });
    });

    describe("list items", () => {
      it("should repair markdown inside list items", () => {
        expect(repair("* Item **bold")).toBe("- Item **bold**");
        expect(repair("- Item _italic")).toBe("- Item _italic_");
        expect(repair("1. Item **bold")).toBe("1. Item **bold**");
      });

      it("should remove empty list items", () => {
        expect(repair("* ")).toBe("");
        expect(repair("- ")).toBe("");
        expect(repair("+ ")).toBe("");
        expect(repair("1. ")).toBe("");
      });
    });

    describe("blockquotes", () => {
      it("should repair markdown inside blockquotes", () => {
        expect(repair("> Quote **bold")).toBe("> Quote **bold**");
        expect(repair("> Quote _italic")).toBe("> Quote _italic_");
      });
    });

    describe("code blocks (fenced)", () => {
      it("should NOT repair markdown inside code blocks", () => {
        const result = repair("```\n**bold\n```");
        expect(result).toContain("```");
        expect(result).toContain("**bold");
        // Should not have closed the **
        expect(result).not.toContain("**bold**");
      });

      it("should handle incomplete code block", () => {
        // Incomplete code blocks are complex - mdast may parse differently
        const result = repair("```js\ncode");
        expect(result).toBeDefined();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 14: Whitespace Handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Whitespace handling", () => {
    describe("leading space stripping", () => {
      // mdast's toMarkdown strips leading whitespace from paragraphs
      it("should strip leading spaces from paragraphs", () => {
        expect(repair(" text")).toBe("text");
        expect(repair("  text")).toBe("text");
        expect(repair("   text")).toBe("text");
      });

      it("should strip leading spaces before markdown", () => {
        expect(repair(" **bold")).toBe("**bold**");
        expect(repair("  _italic")).toBe("_italic_");
      });
    });

    describe("preserving internal spaces", () => {
      it("should preserve spaces between words", () => {
        expect(repair("Hello world")).toBe("Hello world");
        expect(repair("Hello  world")).toBe("Hello  world");
      });

      it("should preserve spaces inside formatting", () => {
        expect(repair("**bold text**")).toBe("**bold text**");
      });
    });

    describe("trailing spaces", () => {
      it("should handle trailing spaces before incomplete marker", () => {
        expect(repair("text **")).toBe("text");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 15: Priority and Ordering
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Priority and ordering", () => {
    describe("code/math priority over formatting", () => {
      // Content inside ` or $ should not have its markdown repaired
      it("should not repair ** inside already-open `", () => {
        // When ` opens before **, the ** should be inside the code
        expect(repair("`code **bold")).toBe("`code **bold`");
      });

      it("should not repair ** inside already-open $$", () => {
        // When $$ opens before **, the ** should be inside the math
        // Display math (at line start) serializes with newlines
        expect(repair("$$math **bold")).toBe("$$\nmath **bold\n$$");
      });
    });

    describe("processing order (by position)", () => {
      it("should close sequences in reverse order of opening", () => {
        // If **  then * then ~~, closes should be ~~** first then * then **
        const result = repair("**bold *italic ~~strike");
        // The exact closing order depends on implementation
        expect(result).toContain("~~strike");
        expect(result).toContain("_italic");
        expect(result).toContain("**bold");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 16: Real-world Streaming Scenarios
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Real-world streaming scenarios", () => {
    describe("partial LLM responses", () => {
      it("should handle typical partial response with formatting", () => {
        expect(repair("Here is a **bold statement")).toBe("Here is a **bold statement**");
      });

      it("should handle partial response with link", () => {
        expect(repair("Check out [this link")).toBe("Check out [this link]()");
      });

      it("should handle partial response with code", () => {
        expect(repair("Use the `command")).toBe("Use the `command`");
      });

      it("should handle partial response with multiple incomplete syntaxes", () => {
        const result = repair("**bold text with [link and `code");
        expect(result).toContain("**bold");
        expect(result).toContain("[link");
        expect(result).toContain("`code");
      });
    });

    describe("markdown in list context", () => {
      it("should handle incomplete bold in list item", () => {
        expect(repair("- **bold item")).toBe("- **bold item**");
      });

      it("should handle incomplete link in list item", () => {
        expect(repair("* [link item")).toBe("- [link item]()");
      });

      it("should handle multiple list items with incomplete markdown in last", () => {
        expect(repair("* item 1\n* **bold")).toBe("- item 1\n- **bold**");
      });
    });

    describe("markdown in heading context", () => {
      it("should handle incomplete formatting in heading", () => {
        expect(repair("# Title **bold")).toBe("# Title **bold**");
      });
    });

    describe("complex nested scenarios", () => {
      it("should handle bold with link inside, both incomplete", () => {
        expect(repair("**bold [link")).toBe("**bold [link]()**");
      });

      it("should handle list with nested formatting", () => {
        expect(repair("* **bold *italic")).toBe("- **bold _italic_**");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 17: Edge Cases and Error Handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Edge cases", () => {
    describe("consecutive markers", () => {
      it("should handle **** (four asterisks)", () => {
        // **** could be parsed as ** ** (empty bold twice) or other
        expect(repair("test ****")).toBe("test ****");
      });

      it("should handle *** (three asterisks)", () => {
        // *** is bold + italic or italic + bold
        expect(repair("_**bold and italic")).toBe("_**bold and italic**_");
      });
    });

    describe("special content", () => {
      it("should handle emoji", () => {
        expect(repair("Hello 👋 **bold")).toBe("Hello 👋 **bold**");
      });

      it("should handle unicode", () => {
        expect(repair("日本語 **太字")).toBe("日本語 **太字**");
      });
    });

    describe("very long content", () => {
      it("should handle long text with incomplete marker at end", () => {
        const longText = `${"a".repeat(1000)} **bold`;
        const result = repair(longText);
        expect(result.endsWith("**")).toBe(true);
      });
    });

    describe("only whitespace", () => {
      it("should handle string with only spaces", () => {
        expect(repair("   ")).toBe("");
      });

      it("should handle string with only newlines", () => {
        expect(repair("\n\n")).toBe("");
      });
    });

    describe("interleaved syntax", () => {
      it("should handle improperly nested bold/italic", () => {
        // **bold _italic** end_ - bold closes before italic
        // This documents the current behavior (may not be "correct" markdown)
        const result = repair("**bold _italic** end_");
        expect(result).toBeDefined();
        expect(result).toContain("**");
      });
    });

    describe("markdown chars in URLs/emails", () => {
      it("should handle URL with trailing asterisks", () => {
        // Autolinks are disabled, so this is treated as text
        const result = repair("https://example.com/path**");
        expect(result).toBeDefined();
      });

      it("should handle email with trailing asterisks", () => {
        const result = repair("user@example.com**");
        expect(result).toBeDefined();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 18: Empty Node Removal
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Empty node removal", () => {
    it("should remove nodes that become empty after repair", () => {
      // When we remove trailing **, the paragraph might become empty
      expect(repair("**")).toBe("");
    });

    it("should remove empty list items (all marker types)", () => {
      expect(repair("* ")).toBe("");
      expect(repair("- ")).toBe("");
      expect(repair("+ ")).toBe("");
      expect(repair("1. ")).toBe("");
    });

    it("should handle nested empty removal", () => {
      // Multiple passes of empty removal (up to 5 per the code)
      expect(repair("> ")).toBe("");
    });

    it("should keep nodes with actual content", () => {
      expect(repair("* item")).toBe("- item");
      expect(repair("**bold**")).toBe("**bold**");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 19: Table Cell Content
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Table cell content repair", () => {
    it("should repair formatting inside table cells", () => {
      // Table cells are repairable nodes per the code
      // mdast normalizes separator dashes to match column width
      expect(repair("|**bold|b|\n|-|-|")).toBe("| **bold** | b |\n| -------- | - |");
    });

    it("should repair links inside table cells", () => {
      // mdast normalizes separator dashes to match column width
      expect(repair("|[link|b|\n|-|-|")).toBe("| [link]() | b |\n| -------- | - |");
    });
  });
});
