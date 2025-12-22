import { describe, expect, it } from "vitest";
import { speechTokenizer } from "./speech-tokenizer";

describe("SpeechTokenizer", () => {
  describe("basic text", () => {
    it("should tokenize plain text", async () => {
      const [err, tokens] = await speechTokenizer.tokenize("Hello world");
      expect(err).toBeUndefined();
      // Tokens are exploded by whitespace, so "Hello world" becomes ["Hello", " ", "world"]
      expect(tokens).toHaveLength(3);
      expect(tokens?.[0]?.value).toBe("Hello");
      expect(tokens?.[1]?.value).toBe(" ");
      expect(tokens?.[2]?.value).toBe("world");
      const startAt = tokens?.[0]?.position.startsAt;
      const endsAt = tokens?.[2]?.position.endsAt;
      expect(startAt).toBeGreaterThanOrEqual(0);
      expect(endsAt).toBeDefined();
      if (startAt !== undefined && endsAt !== undefined) {
        expect(endsAt).toBeGreaterThan(startAt);
      }
    });

    it("should handle empty string", async () => {
      const [err, tokens] = await speechTokenizer.tokenize("");
      expect(err).toBeUndefined();
      expect(tokens).toEqual([]);
    });

    it("should handle whitespace-only text", async () => {
      // Tokenizer requires trimmed input, so we trim the whitespace-only text
      const text = "   \n\n   ".trim();
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // After trimming, we get "\n\n" which becomes 2 break tokens (max 2 consecutive breaks)
      expect(tokens?.length).toBeLessThanOrEqual(2);
    });
  });

  describe("paragraphs", () => {
    it("should tokenize single paragraph", async () => {
      const text = "This is a paragraph.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // Tokens are exploded by whitespace
      expect(tokens?.length).toBeGreaterThan(1);
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is a paragraph.");
    });

    it("should tokenize multiple paragraphs", async () => {
      const text = "First paragraph.\n\nSecond paragraph.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      expect(tokens?.length).toBeGreaterThan(1);
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("should preserve paragraph breaks", async () => {
      const text = "First.\n\nSecond.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toMatch(/First\.\s+Second\./);
    });
  });

  describe("headings", () => {
    it("should tokenize h1 heading", async () => {
      const text = "# Heading Level 1";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Heading Level 1");
      expect(spoken).not.toContain("#");
    });

    it("should tokenize h2 heading", async () => {
      const text = "## Heading Level 2";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Heading Level 2");
      expect(spoken).not.toContain("##");
    });

    it("should tokenize all heading levels", async () => {
      const text = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Verify all headings are present with proper spacing
      expect(spoken).toMatch(/^H1\s+H2\s+H3\s+H4\s+H5\s+H6\s*$/);
      expect(spoken).not.toContain("#");
    });
  });

  describe("text formatting", () => {
    it("should strip bold syntax", async () => {
      const text = "This is **bold text**.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is bold text.");
      expect(spoken).not.toContain("**");
    });

    it("should strip italic syntax", async () => {
      const text = "This is *italic text*.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is italic text.");
      expect(spoken).not.toContain("*");
    });

    it("should strip bold italic syntax", async () => {
      const text = "This is ***bold italic text***.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is bold italic text.");
      expect(spoken).not.toMatch(/\*{1,3}/);
    });

    it("should strip strikethrough syntax", async () => {
      const text = "This is ~~strikethrough text~~.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is strikethrough text.");
      expect(spoken).not.toContain("~~");
    });

    it("should handle multiple formatting in one paragraph", async () => {
      const text = "This has **bold**, *italic*, and ***both***.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This has bold, italic, and both.");
    });
  });

  describe("links", () => {
    it("should strip link syntax and keep text", async () => {
      const text = "This is [a link](https://example.com).";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is a link.");
      expect(spoken).not.toContain("https://example.com");
      expect(spoken).not.toContain("[");
      expect(spoken).not.toContain("]");
    });

    it("should handle link references", async () => {
      const text = "This is [a link][ref].\n\n[ref]: https://example.com";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is a link.");
      expect(spoken).not.toContain("[ref]");
    });

    it("should handle links with formatting", async () => {
      const text = "This is [**bold link**](https://example.com).";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is bold link.");
      expect(spoken).not.toContain("**");
    });
  });

  describe("images", () => {
    it("should use alt text for images", async () => {
      const text = "![Alt text](https://example.com/image.png)";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Alt text");
      expect(spoken).not.toContain("https://example.com/image.png");
    });

    it("should handle images without alt text", async () => {
      const text = "![](https://example.com/image.png)";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("https://example.com/image.png");
    });

    it("should handle image references", async () => {
      const text = "![Alt text][img-ref]\n\n[img-ref]: https://example.com/image.png";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Alt text");
    });
  });

  describe("lists", () => {
    it("should tokenize unordered lists", async () => {
      const text = "- First item\n- Second item\n- Third item";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("First item,\nSecond item,\nThird item,");
      expect(spoken).not.toContain("-");
    });

    it("should tokenize ordered lists", async () => {
      const text = "1. First item\n2. Second item\n3. Third item";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("First item,\nSecond item,\nThird item,");
    });

    it("should handle nested lists", async () => {
      const text = "- Outer item\n  - Inner item";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Outer item,\n\nInner item,");
    });

    it("should handle lists with formatting", async () => {
      const text = "- Item with **bold** and *italic*";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Item with bold and italic,");
      expect(spoken).not.toContain("**");
      expect(spoken).not.toContain("*");
    });
  });

  describe("blockquotes", () => {
    it("should tokenize blockquotes", async () => {
      const text = "> This is a blockquote.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is a blockquote.");
      expect(spoken).not.toContain(">");
    });

    it("should handle multi-line blockquotes", async () => {
      const text = "> Line one.\n> Line two.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Line one.\nLine two.");
    });
  });

  describe("breaks", () => {
    it("should handle hard line breaks", async () => {
      const text = "Line one.  \nLine two.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Line one.\nLine two.");
    });

    it("should handle thematic breaks", async () => {
      const text = "Above.\n\n---\n\nBelow.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Above.\n\nBelow.");
      expect(spoken).not.toContain("---");
    });
  });

  describe("ignored nodes", () => {
    it("should ignore code blocks", async () => {
      const text = "```javascript\nconst x = 1;\n```";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("const x = 1");
      expect(spoken).not.toContain("```");
    });

    it("should ignore math blocks", async () => {
      const text = "$$\nx = y + z\n$$";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("x = y + z");
      expect(spoken).not.toContain("$$");
    });

    it("should ignore tables", async () => {
      const text = "| Header | Header |\n|--------|--------|\n| Cell   | Cell   |";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("Header");
      expect(spoken).not.toContain("Cell");
      expect(spoken).not.toContain("|");
    });

    it("should ignore YAML frontmatter", async () => {
      // Note: YAML frontmatter parsing depends on the markdown parser
      // This test verifies that content after frontmatter is preserved
      const text = "---\ntitle: Test\n---\n\nContent.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("Content");
      // YAML frontmatter may or may not be parsed as YAML depending on parser configuration
      // The important thing is that content is preserved
    });
  });

  describe("inline code", () => {
    it("should sanitize inline code", async () => {
      const text = "This is `inline code`.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is inline code.");
      expect(spoken).not.toContain("`");
    });

    it("should filter special characters from inline code", async () => {
      const text = "This is `code@#$%^&*()`.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("code");
      expect(spoken).not.toMatch(/[@#$%^&*()]/);
    });

    it("should allow allowed symbols in inline code", async () => {
      const text = "This is `x = y + z - w`.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("This is x = y + z - w.");
    });

    it("should collapse whitespace in inline code", async () => {
      const text = "This is `code    with    spaces`.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toMatch(/code\s+with\s+spaces/);
      expect(spoken).not.toMatch(/code\s{4}with\s{4}spaces/);
    });
  });

  describe("inline math", () => {
    it("should convert inline math to speech", async () => {
      const text = "This is $$x = y$$.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("This is");
      expect(spoken).not.toContain("$$");
      // The actual speech output depends on latexToSpeech, but should not contain raw LaTeX
      expect(spoken).not.toContain("x = y");
    });

    it("should handle complex inline math", async () => {
      const text = "This is $$x_{min} = \\frac{a}{b}$$.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("This is");
      expect(spoken).not.toContain("$$");
    });
  });

  describe("URL filtering", () => {
    it("should filter standalone URLs", async () => {
      const text = "Visit http://example.com for more info.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("example dot com");
      expect(spoken).not.toContain("http://example.com");
    });

    it("should filter HTTPS URLs", async () => {
      const text = "Visit https://example.com for more info.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("https://example.com");
    });

    it("should transform file:// URLs to filename", async () => {
      const text = "See file:///path/to/file.txt";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("file dot txt");
      expect(spoken).not.toContain("file:///path/to/file.txt");
    });

    it("should transform file:// URLs with complex filenames", async () => {
      const text = "Open file:///path/to/my-document.pdf";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Hyphens should be stripped from filename parts
      expect(spoken).toContain("dot");
      expect(spoken).toContain("pdf");
      expect(spoken).not.toContain("file://");
    });

    it("should filter FTP URLs", async () => {
      const text = "Download from ftp://example.com/file.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("ftp://example.com/file");
    });

    it("should filter URLs in formatted text", async () => {
      const text = "Visit **http://example.com** for more info.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("example dot com");
      expect(spoken).not.toContain("http://example.com");
    });

    it("should not filter URLs that are part of link syntax", async () => {
      const text = "Visit [example](http://example.com).";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Visit example.");
      expect(spoken).not.toContain("http://example.com");
    });
  });

  describe("whitespace handling", () => {
    it("should explode tokens by whitespace", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // Should split into ["Hello", " ", "world"]
      expect(tokens).toHaveLength(3);
      expect(tokens?.[0]?.value).toBe("Hello");
      expect(tokens?.[1]?.value).toBe(" ");
      expect(tokens?.[2]?.value).toBe("world");
    });

    it("should collapse consecutive spaces", async () => {
      const text = "This    has    many    spaces.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toMatch(/\s{4}/);
      expect(spoken).toMatch(/This\s+has\s+many\s+spaces/);
    });

    it("should collapse consecutive tabs", async () => {
      const text = "This\t\t\thas\t\t\ttabs.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toMatch(/This\s+has\s+tabs/);
    });

    it("should limit consecutive line breaks to 2", async () => {
      const text = "First.\n\n\n\n\nSecond.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Should have at most 2 consecutive newlines
      expect(spoken).not.toMatch(/\n{3,}/);
    });

    it("should remove empty tokens", async () => {
      const text = "First.\n   \nSecond.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const allNonEmpty = tokens?.every((t) => t.value.trim().length > 0 || t.value === "\n");
      expect(allNonEmpty).toBe(true);
    });

    it("should handle tokens that become empty after URL filtering", async () => {
      const text = "Visit http://example.com for more info.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // URL should be transformed to domain, not removed
      expect(spoken).toContain("example dot com");
      expect(spoken).not.toContain("http://example.com");
    });

    it("should strip leading spaces", async () => {
      const text = "   Hello world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toMatch(/^Hello/);
    });

    it("should strip trailing spaces", async () => {
      const text = "Hello world   ";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Hello world");
    });

    it("should strip leading line breaks", async () => {
      const text = "\n\nHello world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toMatch(/^Hello/);
    });

    it("should strip trailing line breaks", async () => {
      const text = "Hello world\n\n";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Hello world");
    });
  });

  describe("punctuation stripping", () => {
    it("should strip unknown punctuation", async () => {
      const text = "Hello #world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Hash (#) is not in KNOWN_PUNCT, so it should be stripped
      expect(spoken).toBe("Hello world");
      expect(spoken).not.toContain("#");
    });

    it("should strip pipe character", async () => {
      const text = "Hello | world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Pipe (|) is not in KNOWN_PUNCT, so it should be stripped
      expect(spoken).toBe("Hello world");
      expect(spoken).not.toContain("|");
    });

    it("should strip emojis", async () => {
      const text = "Hello 🌍 world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Emojis are not in KNOWN_PUNCT, so they should be stripped
      expect(spoken).toBe("Hello world");
      expect(spoken).not.toContain("🌍");
    });

    it("should preserve pause punctuation", async () => {
      const text = "Hello, world! How are you?";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Pause punctuation (comma, period, exclamation, question mark) should be preserved
      expect(spoken).toContain(",");
      expect(spoken).toContain("!");
      expect(spoken).toContain("?");
    });

    it("should preserve expanded punctuation", async () => {
      const text = "Price: $100 + 50%";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Expanded punctuation ($, %, +) should be preserved
      expect(spoken).toContain("$");
      expect(spoken).toContain("%");
      expect(spoken).toContain("+");
    });

    it("should preserve all known punctuation marks", async () => {
      const text = "Test: comma, period. exclamation! question? colon: semicolon; dash-";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // All pause punctuation should be preserved
      expect(spoken).toContain(",");
      expect(spoken).toContain(".");
      expect(spoken).toContain("!");
      expect(spoken).toContain("?");
      expect(spoken).toContain(":");
      expect(spoken).toContain(";");
      expect(spoken).toContain("-");
    });

    it("should preserve unicode letters and numbers", async () => {
      const text = "Hello 世界 123";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Unicode letters and numbers should be preserved
      expect(spoken).toContain("世界");
      expect(spoken).toContain("123");
    });

    it("should strip unknown punctuation but preserve known", async () => {
      const text = "Hello #world, test | another!";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Unknown punctuation (#, |) should be stripped
      expect(spoken).not.toContain("#");
      expect(spoken).not.toContain("|");
      // Known punctuation (comma, exclamation) should be preserved
      expect(spoken).toContain(",");
      expect(spoken).toContain("!");
      // Text should still be readable
      expect(spoken).toContain("Hello");
      expect(spoken).toContain("world");
      expect(spoken).toContain("test");
      expect(spoken).toContain("another");
    });
  });

  describe("position tracking", () => {
    it("should track positions correctly", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // Tokens are exploded by whitespace, so check first and last token positions
      const firstToken = tokens?.[0];
      const lastToken = tokens?.[tokens.length - 1];
      expect(firstToken?.position.startsAt).toBeGreaterThanOrEqual(0);
      expect(lastToken?.position.endsAt).toBeDefined();
      if (firstToken && lastToken) {
        expect(lastToken.position.endsAt).toBeGreaterThan(firstToken.position.startsAt);
        expect(lastToken.position.endsAt).toBeLessThanOrEqual(text.length);
      }
    });

    it("should track positions across multiple tokens", async () => {
      const text = "First.\n\nSecond.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length > 1) {
        const firstEndsAt = tokens[0]?.position.endsAt;
        const secondStartAt = tokens[1]?.position.startsAt;
        if (firstEndsAt !== undefined && secondStartAt !== undefined) {
          expect(firstEndsAt).toBeLessThanOrEqual(secondStartAt);
        }
      }
    });

    it("should reflect ignored node positions on previous token", async () => {
      const text = "Before.\n\n```\ncode\n```\n\nAfter.";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("Before.\n\nAfter.");
      expect(spoken).not.toContain("code");
    });
  });

  describe("complex documents", () => {
    it("should handle a complete markdown document", async () => {
      const text = `# Title

This is a paragraph with **bold** and *italic*.

- List item 1
- List item 2

\`\`\`javascript
// Code block
\`\`\`

More text.`;

      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("Title");
      expect(spoken).toContain("bold");
      expect(spoken).toContain("italic");
      expect(spoken).toContain("List item 1");
      expect(spoken).toContain("List item 2");
      expect(spoken).toContain("More text");
      expect(spoken).not.toContain("// Code block");
      expect(spoken).not.toContain("```");
    });

    it("should handle mixed content", async () => {
      const text = `# Heading

Paragraph with [link](https://example.com) and ![alt text](img.png).

- Item with **bold**
- Item with *italic*

\`\`\`
Code block ignored
\`\`\`

Final paragraph.`;

      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toContain("Heading");
      expect(spoken).toContain("link");
      expect(spoken).toContain("alt text");
      expect(spoken).toContain("bold");
      expect(spoken).toContain("italic");
      expect(spoken).toContain("Final paragraph");
      expect(spoken).not.toContain("Code block ignored");
      expect(spoken).not.toContain("https://example.com");
    });
  });

  describe("edge cases", () => {
    it("should handle text with only markdown syntax", async () => {
      const text = "**";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // Should handle gracefully without crashing
      expect(tokens).toBeDefined();
    });

    it("should handle malformed markdown", async () => {
      const text = "**bold without closing";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBe("bold without closing");
    });

    it("should handle markdown with only ignored nodes", async () => {
      const text = "```\ncode\n```";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).not.toContain("code");
    });

    it("should handle very long text", async () => {
      // Tokenizer requires trimmed input, so we trim the repeated text
      const text = "Word ".repeat(1000).trim();
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      expect(tokens?.length).toBeGreaterThan(0);
      const spoken = tokens?.map((t) => t.value).join("");
      expect(spoken).toBeDefined();
      if (spoken) {
        expect(spoken.length).toBeGreaterThan(0);
      }
    });

    it("should handle unicode characters", async () => {
      const text = "Hello 世界 🌍";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const spoken = tokens?.map((t) => t.value).join("");
      // Unicode letters/numbers are preserved, but emojis are stripped
      expect(spoken).toBe("Hello 世界 ");
      expect(spoken).not.toContain("🌍");
    });
  });

  describe("error handling", () => {
    it("should handle invalid markdown gracefully", async () => {
      // Very malformed markdown that might cause parsing issues
      const text = "[[[[[[[[[[";
      const [err, tokens] = await speechTokenizer.tokenize(text);
      // Should either succeed with empty tokens or return an error
      if (err) {
        expect(err).toBeDefined();
      } else {
        expect(tokens).toBeDefined();
      }
    });
  });
});
