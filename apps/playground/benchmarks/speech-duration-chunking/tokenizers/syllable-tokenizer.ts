import { PUNCTUATIONS } from "./words-tokenizer";

export function syllableTokenizer(text: string): string[] {
  const results: string[] = [];

  const re = /\S+/g;
  let arr: RegExpExecArray | null;
  while ((arr = re.exec(text)) !== null) {
    let block = arr[0];
    // Process punctions prefixes
    if (PUNCTUATIONS.some((punctuation) => block.startsWith(punctuation))) {
      block = block.slice(1);
      results.push(",");
    }
    // Process suffixes prefixes
    if (PUNCTUATIONS.some((punctuation) => block.endsWith(punctuation))) {
      block = block.slice(0, -1);
      results.push(",");
    }
    // Remove any in word
    const word = block.replace(new RegExp(`[${PUNCTUATIONS.join("")}]`, "g"), "");

    // Hypenize the word
    const { syllable } = require("syllable");
    const count = syllable(word);
    if (count) results.push(...Array(count * 2));
  }

  return results;
}
