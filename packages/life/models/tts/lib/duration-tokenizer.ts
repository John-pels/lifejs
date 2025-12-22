import { ToWords } from "to-words";
import * as op from "@/shared/operation";
import { hyphenator } from "./hyphenator";
import { EXPANDED_PUNCT, PAUSE_PUNCT, PUNCT_RE } from "./punctuation";
import { speechTokenizer } from "./speech-tokenizer";

interface DurationToken {
  value: string;
  position: { startsAt: number; endsAt: number };
}

/**
 * The DurationTokenizer chunks a text into tokens corresponding to equal speech duration.
 *
 * It is used in the TTSProviderBase, to estimate the number of transcript tokens to take
 * based on the streamed audio duration.
 *
 * What it does (on top of SpeechTokenizer):
 * - Expands punctuation to words ("$" → "dollar", "%" → "percent")
 * - Expands numbers to words ("29" → "twenty nine")
 * - Splits words into syllables for finer duration estimation
 *
 * Example: "I was wondering, how beautiful **Life** is?"
 */
class DurationTokenizer {
  // Converts numbers to words (e.g., 123 -> "one hundred twenty three")
  readonly #toWords = new ToWords({ localeCode: "en-US" });

  async tokenize(text: string) {
    // 1. Convert the text into speech tokens
    const [errTokens, speechTokens] = await speechTokenizer.tokenize(text);
    if (errTokens) return op.failure(errTokens);

    // 2. Expand some punctuation marks into their spoken form
    const expandedPunctTokens: DurationToken[] = [];
    for (const token of speechTokens) {
      let expandedValue = token.value;
      for (const [symbol, expanded] of Object.entries(EXPANDED_PUNCT)) {
        expandedValue = expandedValue.replaceAll(symbol, ` ${expanded} `);
      }
      const newToken = { ...token, value: expandedValue };
      expandedPunctTokens.push(...speechTokenizer.splitTokenBySpace(newToken));
    }

    // 3. Expand numbers into their spoken form
    const expandedNumTokens: DurationToken[] = [];
    for (const token of expandedPunctTokens) {
      // Replace all number matches (integers and floating points) in the token value
      const expandedValue = token.value.replace(/\d+(\.\d+)?/g, (match) =>
        this.#toWords.convert(Number(match)).replace(/-/g, " ").toLowerCase(),
      );
      const newToken = { ...token, value: expandedValue };
      expandedNumTokens.push(...speechTokenizer.splitTokenBySpace(newToken));
    }

    // 4. Explode token by punctuation marks
    const punctTokens: DurationToken[] = [];
    for (const token of expandedNumTokens) {
      // Split the token value by punctuation marks
      const subValues = token.value.split(PUNCT_RE).filter((v) => v.length > 0);
      // Add the new token to the list
      for (const value of subValues) punctTokens.push({ ...token, value });
    }

    // 5. Remove whitespace/break tokens (reflect their end offset on the previous token)
    const noBreakTokens: DurationToken[] = [];
    for (const token of punctTokens) {
      if (token.value.trim()) noBreakTokens.push(token);
      else {
        const prevToken = noBreakTokens.at(-1);
        if (prevToken) prevToken.position.endsAt = token.position.endsAt;
      }
    }

    // 7. Merge consecutive pause punctuations tokens
    const mergedPauseTokens: DurationToken[] = [];
    let consecutivePauses = 0;
    for (const token of noBreakTokens) {
      // - pause token
      if (PAUSE_PUNCT.has(token.value)) {
        consecutivePauses++;
        // Push pause as-is if it's alone
        if (consecutivePauses === 1) mergedPauseTokens.push(token);
        // Else, extend the last pause's end offset
        else {
          const prevToken = mergedPauseTokens.at(-1);
          if (prevToken) prevToken.position.endsAt = token.position.endsAt;
        }
      }
      // - other token
      else {
        consecutivePauses = 0;
        mergedPauseTokens.push(token);
      }
    }

    // 8. Hyphenate the tokens
    const hyphenatedTokens: DurationToken[] = [];
    for (const token of mergedPauseTokens) {
      // Hyphenate the token value
      const hyphenatedValue = hyphenator.hyphenateWord(token.value);
      for (const value of hyphenatedValue) {
        // Add the new token to the list
        hyphenatedTokens.push({ ...token, value });
      }
    }

    // Return the tokens
    return op.success(hyphenatedTokens);
  }

  async take(text: string, tokensCount: number) {
    if (tokensCount <= 0) return op.success("");
    const [errTokens, tokens] = await this.tokenize(text);
    if (errTokens) return op.failure(errTokens);
    if (tokensCount >= tokens.length) return op.success(text);
    const lastToken = tokens.at(tokensCount - 1);
    const lastTokenEndsAt = lastToken?.position.endsAt ?? 0;
    return op.success(text.slice(0, lastTokenEndsAt));
  }
}

export const durationTokenizer = new DurationTokenizer();
