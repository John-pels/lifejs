import { ToWords } from "to-words";
import * as op from "@/shared/operation";
import { hyphenator } from "./hyphenator";
import { EXPANDED_PUNCT, PAUSE_PUNCT, PUNCT_RE } from "./punctuation";
import { explodeTokenByWhitespaces, speechTokenizer } from "./speech-tokenizer";

interface SpeechDurationToken {
  value: string;
  position: { startsAt: number; endsAt: number };
}

// Converts numbers to words (e.g., 123 -> "one hundred twenty three")
const toWords = new ToWords({ localeCode: "en-US" });

/**
 * The SpeechDurationTokenizer transforms text into "tokens" that represent approximately
 * equal audio duration when converted to speech. It converts numbers and punctuation
 * into their spoken form (e.g., "$" -> "dollar", "12" -> "twelve"), elegantly handle
 * Markdown syntaxes as well as other non-alphanumeric characters that cannot be spoken.
 *
 * For example the text "I was wondering, how beautiful **Life** is?",
 * Becomes: [ "I", "was", "won", "der", "ing", ",", "how", "beau", "ti", "ful", "Life", "is", "?"]
 *
 * This tokenizer is used in the TTSBase class to compute an average duration of audio
 * per token, in order to estimate the audio duration of a given text with an 5-15%
 * accuracy on most samples.Those estimations are used to match emitted audio chunks
 * with their corresponding text chunks.
 */
class SpeechDurationTokenizer {
  async tokenize(text: string) {
    // 1. Convert the text into speech tokens
    const [errTokens, speechTokens] = await speechTokenizer.tokenize(text);
    if (errTokens) return op.failure(errTokens);

    // 2. Expand some punctuation marks into their spoken form
    const expandedPunctTokens: SpeechDurationToken[] = [];
    for (const token of speechTokens) {
      let expandedValue = token.value;
      for (const [symbol, expanded] of Object.entries(EXPANDED_PUNCT)) {
        expandedValue = expandedValue.replaceAll(symbol, ` ${expanded} `);
      }
      const newToken = { ...token, value: expandedValue };
      expandedPunctTokens.push(...explodeTokenByWhitespaces(newToken));
    }

    // 3. Expand numbers into their spoken form
    const expandedNumTokens: SpeechDurationToken[] = [];
    for (const token of expandedPunctTokens) {
      // Replace all number matches (integers and floating points) in the token value
      const expandedValue = token.value.replace(/\d+(\.\d+)?/g, (match) =>
        toWords.convert(Number(match)).replace(/-/g, " ").toLowerCase(),
      );
      const newToken = { ...token, value: expandedValue };
      expandedNumTokens.push(...explodeTokenByWhitespaces(newToken));
    }

    // 4. Explode token by punctuation marks
    const punctTokens: SpeechDurationToken[] = [];
    for (const token of expandedNumTokens) {
      // Split the token value by punctuation marks
      const subValues = token.value.split(PUNCT_RE).filter((v) => v.length > 0);
      // Add the new token to the list
      for (const value of subValues) punctTokens.push({ ...token, value });
    }

    // 5. Remove whitespace/break tokens (reflect their end offset on the previous token)
    const noBreakTokens: SpeechDurationToken[] = [];
    for (const token of punctTokens) {
      if (token.value.trim()) noBreakTokens.push(token);
      else {
        const prevToken = noBreakTokens.at(-1);
        if (prevToken) prevToken.position.endsAt = token.position.endsAt;
      }
    }

    // 7. Merge consecutive pause punctuations tokens
    const mergedPauseTokens: SpeechDurationToken[] = [];
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
    const hyphenatedTokens: SpeechDurationToken[] = [];
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

export const speechDurationTokenizer = new SpeechDurationTokenizer();
