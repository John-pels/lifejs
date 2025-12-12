// Punctuation marks leading to short pauses when spoken
export const PAUSE_PUNCT = new Set([
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
  "\u201C",
  '"',
]);

// Expanded spoken forms of common punctuation symbols

export const EXPANDED_PUNCT: Record<string, string> = {
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
  "²": "squared",
  "³": "cubed",
  "¼": "quarter",
  "½": "half",
  "¾": "three quarters",
  π: "pi",
};
export const KNOWN_PUNCT = new Set([...PAUSE_PUNCT, ...Object.keys(EXPANDED_PUNCT)]);

export const PUNCT_RE = /([^\p{L}\p{N}\s])/gu;
