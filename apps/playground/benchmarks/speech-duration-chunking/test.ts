import { speechDurationTokenizer } from "../../../../packages/life/models/tts/lib/speech-duration-tokenizer";
import { tokenizer } from "./tokenizers/old";

const content = "The meeting is scheduled for 2:30 PM... or was it ...";

console.log("---- new tokenizer")

const [errTokens, tokens] = await speechDurationTokenizer.tokenize(content);
if (errTokens) throw errTokens;
console.log(tokens.map((t) => t.value));

console.log("---- new tokenizer with no trailing pause")
const [errTokens2, tokens2] = await speechDurationTokenizer.tokenize(content, true);
if (errTokens2) throw errTokens2;
console.log(tokens2.map((t) => t.value));

console.log("---- old tokenizer")
const token3 = await tokenizer.chunk(content);
console.log(token3);