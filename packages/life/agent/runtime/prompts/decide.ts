import type { Message } from "@/shared/messages";

export const decidePrompt = (messages: Message[], hint?: string) => `
# Instructions
You're a decision assistant helping another assistant to decide whether they should react/answer
to the user's latest message, and/or last information available in the conversation history.

You'll output a 'shouldReact' boolean, if true, the other assistant will generate an answer.
If false, the other assistant will just be passive.
${hint ? `\n## Extra instructions from the developer\n${hint}` : ""}

## Recent conversation history
Here is the recent conversation history between the other assistant and the user.
Should the other agent react to it (true), or just be passive (false)?

${messages
  .map((message) => {
    if (message.role === "user" || message.role === "system" || message.role === "agent")
      return `[${message.role}]: ${message.content}`;
    return "";
  })
  .join("\n\n")}
`;
