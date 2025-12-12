import { describe, expect, it } from "vitest";
import { speechDurationTokenizer } from "./speech-duration-tokenizer";

describe("SpeechDurationTokenizer", () => {
  describe("basic text", () => {
    it("should tokenize plain text", async () => {
      const [err, tokens] = await speechDurationTokenizer.tokenize("Hello world");
      expect(err).toBeUndefined();
      expect(tokens).toBeDefined();
      expect(tokens?.length).toBeGreaterThan(0);
      // After hyphenation, "Hello" (5 chars) should be split, "world" (5 chars) should be split
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        expect(values.join("")).toContain("Hello");
        expect(values.join("")).toContain("world");
      }
    });

    it("should handle empty string", async () => {
      const [err, tokens] = await speechDurationTokenizer.tokenize("");
      expect(err).toBeUndefined();
      expect(tokens).toEqual([]);
    });
  });

  describe("whitespace removal", () => {
    it("should remove whitespace tokens and reflect position on previous token", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // All tokens should be non-whitespace (whitespace is removed)
      const hasWhitespace = tokens?.some((t) => t.value.trim().length === 0);
      expect(hasWhitespace).toBe(false);
    });

    it("should handle multiple spaces", async () => {
      const text = "Hello    world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // Whitespace should be removed
      const hasWhitespace = tokens?.some((t) => t.value.trim().length === 0);
      expect(hasWhitespace).toBe(false);
    });
  });

  describe("punctuation splitting", () => {
    it("should split tokens by punctuation marks", async () => {
      const text = "Hello, world!";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should have separate tokens for comma and exclamation
        expect(values).toContain(",");
        expect(values).toContain("!");
      }
    });

    it("should handle multiple punctuation marks", async () => {
      const text = "Hello... world?";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should split by ellipsis and question mark
        expect(values.some((v) => v.includes("."))).toBe(true);
        expect(values).toContain("?");
      }
    });

    it("should handle punctuation at word boundaries", async () => {
      const text = "Hello-world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Hyphen should be split out
        expect(values).toContain("-");
      }
    });
  });

  describe("punctuation expansion", () => {
    it("should expand dollar sign to 'dollar'", async () => {
      const text = "Price is $100";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        // "dollar" gets hyphenated, so check for parts or joined value
        expect(joined.toLowerCase()).toContain("dollar");
        expect(joined).not.toContain("$");
      }
    });

    it("should expand percent sign to 'percent'", async () => {
      const text = "50% discount";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        // "percent" gets hyphenated into "per" and "cent"
        expect(joined.toLowerCase()).toContain("per");
        expect(joined.toLowerCase()).toContain("cent");
        expect(joined).not.toContain("%");
      }
    });

    it("should expand at sign to 'at'", async () => {
      const text = "Email me @example.com";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        expect(values).toContain("at");
        expect(values).not.toContain("@");
      }
    });

    it("should expand ampersand to 'and'", async () => {
      const text = "Tom & Jerry";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        expect(values).toContain("and");
        expect(values).not.toContain("&");
      }
    });

    it("should expand plus sign to 'plus'", async () => {
      const text = "2 + 2 = 4";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        expect(values).toContain("plus");
        expect(values).not.toContain("+");
      }
    });

    it("should expand equals sign to 'equals'", async () => {
      const text = "x = y";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        expect(values).toContain("equals");
        expect(values).not.toContain("=");
      }
    });

    it("should expand degree symbol to 'degree'", async () => {
      const text = "90° angle";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        // "degree" gets hyphenated
        expect(joined.toLowerCase()).toContain("degree");
        expect(joined).not.toContain("°");
      }
    });

    it("should handle multiple expanded punctuation", async () => {
      const text = "$100 + 50%";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("dollar");
        expect(joined).toContain("plus");
        expect(joined).toContain("per");
        expect(joined).toContain("cent");
      }
    });
  });

  describe("number expansion", () => {
    it("should expand single digit numbers", async () => {
      const text = "I have 5 apples";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("five");
        expect(joined).not.toContain("5");
      }
    });

    it("should expand two-digit numbers", async () => {
      const text = "There are 42 answers";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // "42" becomes "forty two" (may be capitalized and hyphenated)
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("forty");
        expect(joined).toContain("two");
        expect(joined).not.toContain("42");
      }
    });

    it("should expand three-digit numbers", async () => {
      const text = "The year is 2024";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // "2024" becomes "two thousand twenty four" (may be capitalized and hyphenated)
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("two");
        expect(joined).toContain("thousand");
        expect(joined).not.toContain("2024");
      }
    });

    it("should expand large numbers", async () => {
      const text = "The number is 123456";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should be expanded into words
        expect(values.some((v) => v.match(/^[a-z]+$/))).toBe(true);
        expect(values).not.toContain("123456");
      }
    });

    it("should handle numbers with punctuation", async () => {
      const text = "Price: $100";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("dollar");
        // "$100" gets expanded: "$" becomes "dollar" and "100" becomes "one hundred"
        expect(joined).toContain("one");
        expect(joined).toContain("hundred");
        expect(joined).not.toContain("100");
      }
    });

    it("should handle multiple numbers in text", async () => {
      const text = "I have 3 cats and 2 dogs";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("three");
        expect(joined).toContain("two");
        expect(joined).not.toContain("3");
        expect(joined).not.toContain("2");
      }
    });

    it("should expand floating point numbers", async () => {
      const text = "The price is 3.14 dollars";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        // "3.14" should be expanded to "three point fourteen" (number-to-words converts decimals as whole numbers)
        expect(joined).toContain("three");
        expect(joined).toContain("point");
        expect(joined).toContain("fourteen");
        expect(joined).not.toContain("3.14");
      }
    });

    it("should expand decimal numbers", async () => {
      const text = "Temperature is 98.6 degrees";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        // "98.6" should be expanded
        expect(joined).toContain("point");
        expect(joined).toContain("six");
        expect(joined).not.toContain("98.6");
      }
    });

    it("should expand small decimal numbers", async () => {
      const text = "The value is 0.5";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        // "0.5" should be expanded to "zero point five" or "point five"
        expect(joined).toContain("point");
        expect(joined).toContain("five");
        expect(joined).not.toContain("0.5");
      }
    });
  });

  describe("punctuation stripping", () => {
    it("should keep pause punctuation", async () => {
      const text = "Hello, world!";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Pause punctuation should be kept
        expect(values).toContain(",");
        expect(values).toContain("!");
      }
    });

    it("should strip unknown punctuation", async () => {
      const text = "Hello #world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Hash should be stripped (not in PAUSE_PUNCT or EXPANDED_PUNCT)
        expect(values).not.toContain("#");
      }
    });

    it("should keep known punctuation marks", async () => {
      const text = "Hello, world. How are you?";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        expect(values).toContain(",");
        expect(values).toContain(".");
        expect(values).toContain("?");
      }
    });
  });

  describe("hyphenation", () => {
    it("should hyphenate long words", async () => {
      const text = "beautiful";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // "beautiful" (9 chars) should be hyphenated into multiple parts
        expect(values.length).toBeGreaterThan(1);
        // All parts should be non-empty
        expect(values.every((v) => v.length > 0)).toBe(true);
      }
    });

    it("should not hyphenate short words", async () => {
      const text = "word";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // "word" (4 chars) should not be hyphenated
        expect(values).toEqual(["word"]);
      }
    });

    it("should hyphenate words longer than 4 characters", async () => {
      const text = "wonderful";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // "wonderful" (9 chars) should be hyphenated
        expect(values.length).toBeGreaterThan(1);
      }
    });

    it("should handle hyphenated words correctly", async () => {
      const text = "well-known";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Hyphen should be split out, then words hyphenated separately
        expect(values).toContain("-");
      }
    });
  });

  describe("position tracking", () => {
    it("should track positions correctly", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length > 0) {
        const firstToken = tokens[0];
        const lastToken = tokens.at(-1);
        if (firstToken && lastToken) {
          expect(firstToken.position.startsAt).toBeGreaterThanOrEqual(0);
          expect(lastToken.position.endsAt).toBeDefined();
          expect(lastToken.position.endsAt).toBeLessThanOrEqual(text.length);
          expect(lastToken.position.endsAt).toBeGreaterThan(firstToken.position.startsAt);
        }
      }
    });

    it("should reflect whitespace end positions on previous tokens", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length > 0) {
        // Find tokens that correspond to "Hello" and "world"
        // The token for "Hello" should have its endsAt extended to include the space
        const helloToken = tokens.find((t) => t.value.includes("Hello") || t.value.startsWith("H"));
        if (helloToken) {
          // The position should account for the space after "Hello"
          expect(helloToken.position.endsAt).toBeGreaterThan(helloToken.position.startsAt);
        }
      }
    });

    it("should maintain position continuity", async () => {
      const text = "Hello, world!";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length > 1) {
        // Positions should be non-decreasing
        for (let i = 1; i < tokens.length; i++) {
          const prev = tokens[i - 1];
          const curr = tokens[i];
          if (prev && curr) {
            expect(curr.position.startsAt).toBeGreaterThanOrEqual(prev.position.startsAt);
          }
        }
      }
    });
  });

  describe("markdown handling", () => {
    it("should strip markdown formatting", async () => {
      const text = "This is **bold** text";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        expect(joined).toContain("bold");
        expect(joined).not.toContain("**");
      }
    });

    it("should handle markdown links", async () => {
      const text = "Visit [Google](https://google.com)";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        expect(joined).toContain("Google");
        expect(joined).not.toContain("https://google.com");
        expect(joined).not.toContain("[");
        expect(joined).not.toContain("]");
      }
    });

    it("should handle markdown headings", async () => {
      const text = "# Heading Level 1";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        expect(joined).toContain("Heading");
        expect(joined).toContain("Level");
        expect(joined).not.toContain("#");
      }
    });

    it("should handle markdown lists", async () => {
      const text = "- First item\n- Second item";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        expect(joined).toContain("First");
        expect(joined).toContain("Second");
        expect(joined).not.toContain("-");
      }
    });
  });

  describe("complex scenarios", () => {
    it("should handle text with numbers, punctuation, and formatting", async () => {
      const text = "Price: $100 (50% off)";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("dollar");
        expect(joined).toContain("per");
        expect(joined).toContain("cent");
        expect(joined).toContain("fifty");
        expect(joined).not.toContain("$");
        expect(joined).not.toContain("%");
        // "$100" gets expanded: "$" becomes "dollar" and "100" becomes "one hundred"
        expect(joined).toContain("one");
        expect(joined).toContain("hundred");
        expect(joined).not.toContain("100");
      }
    });

    it("should handle mathematical expressions", async () => {
      const text = "2 + 2 = 4";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("plus");
        expect(joined).toContain("equals");
        expect(joined).toContain("two");
        expect(joined).toContain("four");
        expect(joined).not.toContain("+");
        expect(joined).not.toContain("=");
        expect(joined).not.toContain("2");
        expect(joined).not.toContain("4");
      }
    });

    it("should handle currency and percentages together", async () => {
      const text = "Save $50 or 25%";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("dollar");
        expect(joined).toContain("per");
        expect(joined).toContain("cent");
        expect(joined).toContain("twenty");
        expect(joined).toContain("five");
        // "$50" gets expanded: "$" becomes "dollar" and "50" becomes "fifty"
        expect(joined).toContain("fifty");
        expect(joined).not.toContain("50");
      }
    });

    it("should handle long sentences with various elements", async () => {
      const text = "The price is $1,234.56, which is 10% more than before!";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("dollar");
        expect(joined).toContain("per");
        expect(joined).toContain("cent");
        expect(values).toContain(",");
        expect(values).toContain("!");
        // Note: "$1" becomes "dollar1", so "1" doesn't get expanded
        // But "234" and "56" are separate numbers that do get expanded
        expect(joined).toContain("two");
        expect(joined).toContain("hundred");
        expect(joined).toContain("thirty");
        expect(joined).toContain("four");
        expect(joined).toContain("fifty");
        expect(joined).toContain("six");
        expect(joined).toContain("ten");
      }
    });
  });

  describe("URL handling", () => {
    it("should transform HTTP URLs to domain", async () => {
      const text = "Visit http://example.com for more info";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("example");
        expect(joined).toContain("dot");
        expect(joined).toContain("com");
        expect(joined).not.toContain("http://example.com");
      }
    });

    it("should transform HTTPS URLs to domain", async () => {
      const text = "Visit https://test.google.com/path";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("test");
        expect(joined).toContain("google");
        expect(joined).toContain("dot");
        expect(joined).toContain("com");
        expect(joined).not.toContain("https://");
      }
    });

    it("should transform file:// URLs to filename", async () => {
      const text = "See file:///path/to/file.txt";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("file");
        expect(joined).toContain("dot");
        expect(joined).toContain("txt");
        expect(joined).not.toContain("file:///path/to/file.txt");
      }
    });

    it("should transform file:// URLs with complex filenames", async () => {
      const text = "Open file:///path/to/my-document.pdf";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        // Hyphens should be stripped, so "my-document" becomes "mydocument"
        expect(joined).toContain("dot");
        expect(joined).toContain("pdf");
        expect(joined).not.toContain("file://");
      }
    });
  });

  describe("edge cases", () => {
    it("should handle text with only punctuation", async () => {
      const text = "!!!";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should have exclamation marks
        expect(values.length).toBeGreaterThan(0);
      }
    });

    it("should handle text with only numbers", async () => {
      const text = "123";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should be expanded to words (may be capitalized and hyphenated)
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("one");
        expect(joined).toContain("hundred");
        expect(joined).toContain("twenty");
        expect(joined).toContain("three");
        expect(joined).not.toContain("123");
      }
    });

    it("should handle text with only expanded punctuation", async () => {
      const text = "$";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // "dollar" gets hyphenated
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("dollar");
        expect(joined).not.toContain("$");
      }
    });

    it("should handle very long words", async () => {
      const text = "supercalifragilisticexpialidocious";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should be hyphenated into multiple parts
        expect(values.length).toBeGreaterThan(1);
        // All parts should be non-empty
        expect(values.every((v) => v.length > 0)).toBe(true);
      }
    });

    it("should handle mixed case words", async () => {
      const text = "Hello WORLD";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Should handle both words (may be hyphenated)
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("hello");
        expect(joined).toContain("world");
      }
    });

    it("should handle unicode characters", async () => {
      const text = "Hello 世界";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Unicode should be preserved
        expect(values.some((v) => v.includes("世界"))).toBe(true);
      }
    });

    it("should handle text with emojis", async () => {
      const text = "Hello 😀 world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      // Should not crash, emojis may be filtered or preserved depending on implementation
      expect(tokens).toBeDefined();
    });
  });

  describe("integration with speech tokenizer", () => {
    it("should process markdown-stripped text correctly", async () => {
      const text = "This is **bold** and *italic* text with [a link](url).";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        expect(joined).toContain("bold");
        expect(joined).toContain("italic");
        expect(joined).toContain("link");
        expect(joined).not.toContain("**");
        expect(joined).not.toContain("*");
        expect(joined).not.toContain("[");
        expect(joined).not.toContain("]");
      }
    });

    it("should handle code blocks correctly", async () => {
      const text = "Here is code:\n\n```\nconst x = 1;\n```\n\nMore text.";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("");
        expect(joined).toContain("Here");
        expect(joined).toContain("More");
        expect(joined).not.toContain("const x = 1");
        expect(joined).not.toContain("```");
      }
    });

    it("should handle tables correctly", async () => {
      const text = "| Header | Header |\n|--------|--------|\n| Cell   | Cell   |";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        // Tables should be ignored by speech tokenizer
        const joined = values.join("");
        expect(joined).not.toContain("Header");
        expect(joined).not.toContain("Cell");
      }
    });
  });

  describe("token value validation", () => {
    it("should not produce empty tokens", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens) {
        // All tokens should have non-empty values
        const emptyTokens = tokens.filter((t) => t.value.length === 0);
        expect(emptyTokens.length).toBe(0);
      }
    });

    it("should produce tokens with valid positions", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens) {
        for (const token of tokens) {
          expect(token.position.startsAt).toBeGreaterThanOrEqual(0);
          expect(token.position.endsAt).toBeGreaterThan(token.position.startsAt);
          expect(token.position.endsAt).toBeLessThanOrEqual(text.length);
        }
      }
    });

    it("should maintain token order", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length > 1) {
        // Tokens should be in order
        for (let i = 1; i < tokens.length; i++) {
          const prev = tokens[i - 1];
          const curr = tokens[i];
          if (prev && curr) {
            expect(curr.position.startsAt).toBeGreaterThanOrEqual(prev.position.startsAt);
          }
        }
      }
    });
  });

  describe("critical edge cases", () => {
    it("should handle time format with colon", async () => {
      const text = "2:30 PM";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      expect(tokens).toBeDefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("two");
        expect(joined).toContain("thirty");
        expect(values).toContain(":");
        expect(joined).toContain("pm");
      }
    });

    it("should handle ellipsis with emoji", async () => {
      const text = "You know... 🤗";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      expect(tokens).toBeDefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("you");
        expect(joined).toContain("know");
        // Should handle ellipsis (may be split or kept as pause punctuation)
        expect(values.some((v) => v.includes("."))).toBe(true);
      }
    });

    it("should handle negative and positive numbers with degree symbol", async () => {
      const text = "-10°C or +25°";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      expect(tokens).toBeDefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        // Should expand numbers
        expect(joined).toContain("ten");
        expect(joined).toContain("twenty");
        expect(joined).toContain("five");
        // Should expand degree symbol
        expect(joined).toContain("degree");
        // Should expand plus sign
        expect(joined).toContain("plus");
        // Should handle negative sign (may be kept as pause punctuation or expanded)
        expect(joined).toContain("c");
        expect(joined).toContain("or");
      }
    });

    it("should handle consecutive pause punctuations", async () => {
      const text = "Consecutive pause punctuations :-";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      expect(tokens).toBeDefined();
      const values = tokens?.map((t) => t.value);
      expect(values).toBeDefined();
      if (values) {
        const joined = values.join("").toLowerCase();
        expect(joined).toContain("consecutive");
        expect(joined).toContain("pause");
        expect(joined).toContain("punctuations");
        // Consecutive pause punctuations should be merged into a single token
        // The colon and hyphen should be handled appropriately
        expect(values.some((v) => v === ":" || v === "-" || v.includes(":"))).toBe(true);
      }
    });
  });

  describe("take() method", () => {
    it("should take first N tokens from text", async () => {
      const text = "Hello world";
      const [err, result] = await speechDurationTokenizer.take(text, 3);
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      // Should return a substring of the original text
      expect(result?.length).toBeLessThanOrEqual(text.length);
      expect(text.startsWith(result || "")).toBe(true);
    });

    it("should return empty string when taking 0 tokens", async () => {
      const text = "Hello world";
      const [err, result] = await speechDurationTokenizer.take(text, 0);
      expect(err).toBeUndefined();
      // tokensCount <= 0 returns empty string
      expect(result).toBe("");
    });

    it("should return full text when taking more tokens than available", async () => {
      const text = "Hello world";
      const [_err, tokens] = await speechDurationTokenizer.tokenize(text);
      const tokenCount = tokens?.length || 0;
      const [errTake, result] = await speechDurationTokenizer.take(text, tokenCount + 10);
      expect(errTake).toBeUndefined();
      // When tokensCount >= tokens.length, returns full text
      expect(result).toBe(text);
    });

    it("should return full text when taking exactly all tokens", async () => {
      const text = "Hello world";
      const [_err, tokens] = await speechDurationTokenizer.tokenize(text);
      const tokenCount = tokens?.length || 0;
      const [errTake, result] = await speechDurationTokenizer.take(text, tokenCount);
      expect(errTake).toBeUndefined();
      expect(result).toBe(text);
    });

    it("should handle empty string", async () => {
      const text = "";
      const [err, result] = await speechDurationTokenizer.take(text, 1);
      expect(err).toBeUndefined();
      expect(result).toBe("");
    });

    it("should correctly slice text based on token positions", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length >= 2) {
        const [errTake, result] = await speechDurationTokenizer.take(text, 2);
        expect(errTake).toBeUndefined();
        expect(result).toBeDefined();
        // The result should end at the position where the 2nd token ends
        const secondToken = tokens[1];
        if (secondToken) {
          expect(result).toBe(text.slice(0, secondToken.position.endsAt));
        }
      }
    });

    it("should handle text with punctuation", async () => {
      const text = "Hello, world!";
      const [err, result] = await speechDurationTokenizer.take(text, 5);
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(text.startsWith(result || "")).toBe(true);
      expect(result?.length).toBeLessThanOrEqual(text.length);
    });

    it("should handle text with numbers", async () => {
      const text = "I have 5 apples";
      const [err, result] = await speechDurationTokenizer.take(text, 4);
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(text.startsWith(result || "")).toBe(true);
    });

    it("should handle single token", async () => {
      const text = "Hello";
      const [err, result] = await speechDurationTokenizer.take(text, 1);
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      // Should return at least part of the text
      expect(result?.length).toBeGreaterThan(0);
      expect(text.startsWith(result || "")).toBe(true);
    });

    it("should handle text with expanded punctuation", async () => {
      const text = "Price is $100";
      const [err, result] = await speechDurationTokenizer.take(text, 3);
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(text.startsWith(result || "")).toBe(true);
    });

    it("should handle long text with multiple tokens", async () => {
      const text = "The quick brown fox jumps over the lazy dog";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      const tokenCount = tokens?.length || 0;
      // Only test if we have at least 10 tokens
      if (tokenCount >= 10) {
        const [errTake, result] = await speechDurationTokenizer.take(text, 10);
        expect(errTake).toBeUndefined();
        expect(result).toBeDefined();
        expect(text.startsWith(result || "")).toBe(true);
        // Should be a valid substring
        const sliceIndex = result?.length || 0;
        expect(sliceIndex).toBeGreaterThan(0);
        expect(sliceIndex).toBeLessThanOrEqual(text.length);
      }
    });

    it("should maintain position accuracy across multiple calls", async () => {
      const text = "Hello world, how are you?";
      const [err1, result1] = await speechDurationTokenizer.take(text, 3);
      const [err2, result2] = await speechDurationTokenizer.take(text, 5);
      expect(err1).toBeUndefined();
      expect(err2).toBeUndefined();
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // result2 should be longer than result1 (or equal if positions overlap)
      expect(result2?.length || 0).toBeGreaterThanOrEqual(result1?.length || 0);
      // Both should be valid prefixes
      expect(text.startsWith(result1 || "")).toBe(true);
      expect(text.startsWith(result2 || "")).toBe(true);
    });

    it("should handle text with markdown", async () => {
      const text = "This is **bold** text";
      const [err, result] = await speechDurationTokenizer.take(text, 4);
      expect(err).toBeUndefined();
      expect(result).toBeDefined();
      expect(text.startsWith(result || "")).toBe(true);
    });

    it("should return correct slice when token ends at exact position", async () => {
      const text = "Hello world";
      const [err, tokens] = await speechDurationTokenizer.tokenize(text);
      expect(err).toBeUndefined();
      if (tokens && tokens.length > 0) {
        const firstTokenEnd = tokens[0]?.position.endsAt;
        if (firstTokenEnd !== undefined) {
          const [errTake, result] = await speechDurationTokenizer.take(text, 1);
          expect(errTake).toBeUndefined();
          expect(result).toBe(text.slice(0, firstTokenEnd));
        }
      }
    });

    it("should return full text when taking more tokens than available (very large count)", async () => {
      const text = "Hello";
      const [err, result] = await speechDurationTokenizer.take(text, 1000);
      expect(err).toBeUndefined();
      // When tokensCount >= tokens.length, returns full text
      expect(result).toBe(text);
    });

    it("should return empty string when taking negative token count", async () => {
      const text = "Hello world";
      const [err, result] = await speechDurationTokenizer.take(text, -1);
      expect(err).toBeUndefined();
      // tokensCount <= 0 returns empty string
      expect(result).toBe("");
    });
  });
});
