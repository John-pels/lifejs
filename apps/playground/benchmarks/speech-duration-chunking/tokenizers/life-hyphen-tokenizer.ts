import { hyphenator } from "../../../../../packages/life/models/tts/lib/hyphenator";
import { PUNCTUATIONS } from "./words-tokenizer";

export function lifeHyphenTokenizer(text: string): string[] {
  const results: string[] = [];

  const re = /\S+/g;
  let arr: RegExpExecArray | null;
  while ((arr = re.exec(text)) !== null) {
    let block = arr[0];
    // Process punctions prefixes
    if (PUNCTUATIONS.some((punctuation) => block.startsWith(punctuation))) {
      results.push(`pre-${block.at(0) ?? ""}`);
      block = block.slice(1);
    }
    // Process suffixes prefixes
    let suffix: string | null = null;
    if (PUNCTUATIONS.some((punctuation) => block.endsWith(punctuation))) {
      suffix = block.at(-1) ?? null;
      block = block.slice(0, -1);
    }
    // Remove any in word
    const word = block.replace(new RegExp(`[${PUNCTUATIONS.join("")}]`, "g"), "");

    // Hypenize the word
    const hyphenated = hyphenator.hyphenateWord(word);
    if (hyphenated.length) results.push(...hyphenated);

    // Add suffix if it exists
    if (suffix) results.push(`suf-${suffix}`);
  }

  // const whitespaceCount = text.match(/\s/g)?.length ?? 0;
  // results.push(...Array(Math.floor(whitespaceCount / 10)).fill(" ")); // or some whitespace token

  return results;
}
