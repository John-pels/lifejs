import { ToWords } from "to-words";
import { hyphenator } from "../../../../../packages/life/models/tts/lib/hyphenator";

/**
 * The SpokenTextChunker class is used to split a given text into "chunks"
 * which represent pieces of texts leading to the same duration of audio
 * when spoken.
 * For example: "I was wondering, how beautiful Life is?",
 * Becomes: [ "I", "was", "won", "der", "ing", ",", "how", "beau", "ti", "ful", "Life", "is", "?"]
 *
 * It is used in the TTS base class to maintain an average duration of
 * audio per chunk, then allowing us to estimate the audio duration of a
 * given text with an 5-15% accuracy on most samples.
 *
 * Those estimations are used to match emitted audio chunks with their
 * corresponding text chunks.
 */

const toWords = new ToWords({ localeCode: "en-US" });
const esc = (c: string) => c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

// Punctuation leading to short pauses when spoken
export const PAUSE_PUNCT = [
  ",",
  ".",
  "!",
  "?",
  ":",
  ";",
  "-",
  "—",
  "–",
  "…",
  "...",
  "(",
  "«",
  "“",
  '"',
];

// Punctuation that are spoken out as a word(s)
export const SPOKEN_PUNCT: Record<string, string> = {
  $: "dollar",
  "€": "euro",
  "£": "pound",
  "¥": "yen",
  "₹": "rupee",
  "%": "percent",
  "‰": "per-mille",
  "@": "at",
  "&": "and",
  "+": "plus",
  "×": "times",
  "÷": "divided by",
  "=": "equals",
  "<": "less than",
  ">": "greater than",
  "^": "to the power of",
  "′": "prime",
  "″": "double prime",
  "°": "degree",
};

const SILENCE_SET = new Set(PAUSE_PUNCT);
const EXPANDED_SET = new Set(Object.keys(SPOKEN_PUNCT));

const KNOWN_SINGLE = [...SILENCE_SET, ...EXPANDED_SET].filter((c) => c.length === 1);
const KNOWN_RE = new RegExp(`[${KNOWN_SINGLE.map(esc).join("")}]`, "g");
const STRIP_RE = /[^\p{L}\p{N}'’]+/u; // strip ALL other punctuation

interface Chunk {
  chunk: string;
  start: number;
  end: number;
}

/* does a chunk consist only of silence marks? */
const isSilenceChunk = (c: Chunk | null): c is Chunk =>
  !!c && c.chunk.length > 0 && SILENCE_SET.has(c.chunk[0] ?? "");

// biome-ignore-start lint/performance/useTopLevelRegex: hoisting regexes broke the tokenizer, we'll keep them inline until this becomes a perf issue
export class SpokenTextTokenizer {
  /* ────────── core iterator ────────── */
  private *iter(text: string): Generator<Chunk> {
    const nonBlank = /\S+/g;
    let m: RegExpExecArray | null;
    let last: Chunk | null = null;

    while ((m = nonBlank.exec(text))) {
      let token = m[0];
      let pos = m.index;

      /* PREFIX ── handle any leading punctuation on this token */
      while (
        token &&
        (token.startsWith("...") ||
          SILENCE_SET.has(token[0] ?? "") ||
          EXPANDED_SET.has(token[0] ?? ""))
      ) {
        const mark = token.startsWith("...") ? "..." : (token[0] ?? "");

        if (SILENCE_SET.has(mark)) {
          if (isSilenceChunk(last)) {
            last.chunk += mark; // merge consecutive silences
          } else {
            last = yield* this.emitSilence(mark, pos); // standalone silence chunk
          }
        } else {
          yield* this.emitExpanded(mark, pos, (c) => (last = c));
        }

        token = token.slice(mark.length);
        pos += mark.length;
      }

      /* strip unknown leading punctuation */
      while (token && STRIP_RE.test(token[0] ?? "")) {
        token = token.slice(1);
        pos++;
      }
      if (!token) continue; // nothing left after stripping

      /* SUFFIX ── collect any known trailing punctuation */
      const suffixes: string[] = [];
      while (
        token.endsWith("...") ||
        SILENCE_SET.has(token.at(-1) ?? "") ||
        EXPANDED_SET.has(token.at(-1) ?? "")
      ) {
        if (token.endsWith("...")) {
          suffixes.push("...");
          token = token.slice(0, -3);
        } else {
          suffixes.push(token.at(-1) ?? "");
          token = token.slice(0, -1);
        }
      }
      /* strip unknown trailing punctuation */
      while (token && STRIP_RE.test(token.at(-1) ?? "")) token = token.slice(0, -1);

      /* emit the main word / number, hyphenated */
      if (token) {
        if (/^\d+$/.test(token)) {
          for (const w of toWords.convert(Number(token)).replace(/-/g, " ").split(/\s+/))
            for (const p of hyphenator.hyphenateWord(w)) {
              const c = { chunk: p, start: pos, end: pos };
              yield c;
              last = c;
            }
        } else {
          const clean = token.replace(KNOWN_RE, "");
          let idx = 0;
          for (const p of hyphenator.hyphenateWord(clean)) {
            const st = text.indexOf(p, pos + idx);
            const en = st + p.length;
            idx = en - pos;
            const c = { chunk: p, start: st, end: en };
            yield c;
            last = c;
          }
        }
      }

      /* emit suffixes in reverse order (right-to-left) */
      for (let i = suffixes.length - 1; i >= 0; i--) {
        const mark = suffixes[i] ?? "";
        const at = m.index + m[0].length - suffixes.slice(0, i + 1).join("").length;

        if (SILENCE_SET.has(mark)) {
          if (isSilenceChunk(last)) {
            last.chunk += mark; // merge with previous silence chunk
            continue;
          }
          last = yield* this.emitSilence(mark, at); // <-- NO special case for “last char” any more
        } else {
          yield* this.emitExpanded(mark, at, (c) => (last = c));
        }
      }
    }
  }

  /* ────────── helpers ────────── */
  private *emitSilence(mark: string, at: number): Generator<Chunk, Chunk, unknown> {
    const c = { chunk: mark, start: at, end: at + mark.length };
    yield c;
    return c;
  }
  private *emitExpanded(mark: string, at: number, save: (c: Chunk) => void): Generator<Chunk> {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    for (const w of SPOKEN_PUNCT[mark]!.split(/\s+/))
      for (const p of hyphenator.hyphenateWord(w)) {
        const c = { chunk: p, start: at, end: at + mark.length };
        save(c);
        yield c;
      }
  }

  /* ────────── public API ────────── */
  chunk(text: string) {
    return [...this.iter(text)].map((c) => c.chunk);
  }
  weight(text: string) {
    return [...this.iter(text)].length;
  }

  take(text: string, k: number) {
    if (k <= 0) return { taken: "", rest: text };
    let used = 0,
      cut = text.length;
    for (const { end } of this.iter(text))
      if (++used === k) {
        cut = end;
        break;
      }
    return { taken: text.slice(0, cut), rest: text.slice(cut) };
  }
}

export const tokenizer = new SpokenTextTokenizer();

// biome-ignore-end lint/performance/useTopLevelRegex: reason