export const PUNCTUATIONS = [
  "!",
  '"',
  "#",
  "$",
  "%",
  "&",
  "'",
  "(",
  ")",
  "*",
  "+",
  ",",
  "-",
  ".",
  "/",
  ":",
  ";",
  "<",
  "=",
  ">",
  "?",
  "@",
  "[",
  "\\",
  "]",
  "^",
  "_",
  "`",
  "{",
  "|",
  "}",
  "~",
  "±",
  "—",
  "‘",
  "’",
  "“",
  "”",
  "…",
];

/**
 * Split the text into words.
 */
export const wordsTokenizer = (
  text: string,
  ignorePunctuation = true,
): [string, number, number][] => {
  const re = /\S+/g;
  const words: [string, number, number][] = [];

  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let arr;
  while ((arr = re.exec(text)) !== null) {
    let word = arr[0];
    const start = arr.index;
    const end = start + word.length;

    if (ignorePunctuation) {
      word = word.replace(new RegExp(`[${PUNCTUATIONS.join("")}]`, "g"), "");
    }

    words.push([word, start, end]);
  }

  return words;
};
