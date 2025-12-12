import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { STATE } from "mathjax-full/js/core/MathItem.js";
import type { MmlNode } from "mathjax-full/js/core/MmlTree/MmlNode";
import { SerializedMmlVisitor } from "mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js";
import { HTMLDocument } from "mathjax-full/js/handlers/html/HTMLDocument.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
// @ts-expect-error
import * as SRE from "speech-rule-engine";

const packages = AllPackages.filter((name) => name !== "bussproofs");
const tex = new TeX({ packages });

const adaptor = liteAdaptor();
const html = new HTMLDocument("", adaptor, { InputJax: tex });

const visitor = new SerializedMmlVisitor();
const toMathML = (node: MmlNode) => visitor.visitTree(node);

export function tex2mml(latex: string, display = true): string {
  const node = html.convert(latex, { display, end: STATE.CONVERT });
  return toMathML(node);
}

export type LatexToSpeechOptions = {
  lang?: "en";
  enableSSML?: boolean;
};

let sreInit: Promise<void> | null = null;

/**
 * Initialize SRE once with the given options.
 * For minimalism, we don't support changing options later.
 */
function ensureSre(options?: unknown) {
  // One-time setup; later calls ignore different options.
  if (!sreInit) sreInit = SRE.setupEngine(options ?? {});
  return sreInit as Promise<void>;
}

/**
 * Minimal "one expression" wrapper: LaTeX -> MathML -> speech string.
 */
export async function latexToSpeech(
  latex: string,
  options?: LatexToSpeechOptions,
): Promise<string> {
  await ensureSre({
    domain: "clearspeak",
    lang: options?.lang ?? "en",
    ...(options?.enableSSML ? { markup: "ssml" } : {}),
  });
  return SRE.toSpeech(tex2mml(latex));
}
