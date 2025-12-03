import { hyphenator } from "../../../../../packages/life/models/tts/lib/hyphenator";
import { wordsTokenizer } from "./words-tokenizer";

export function hyphenTokenizer(text: string): string[] {
  const words = wordsTokenizer(text);
  const hyphenatedWords = words.map((word) => hyphenator.hyphenateWord(word[0]));
  return hyphenatedWords.flat();
}
