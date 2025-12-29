import * as op from "@/shared/operation";
import { MessageList } from "../../../messages";
import { defineHandler } from "./define";

// Update the messages history based on events
export const maintainMessagesHandler = defineHandler({
  name: "maintain-messages",
  mode: "block",
  /**
   * @returns The id of the created or updated message (if any).
   */
  onEvent: ({ event, context }) => {
    // Get current messages from context
    const [errGet, contextValue] = context.get();
    if (errGet) return op.failure(errGet);
    const messages = new MessageList(contextValue.messages);

    // Handle 'add-message'
    let updatedMessageId: string | undefined;
    if (event.name === "add-message") {
      const [errCreate, messageId] = messages.create(event.data.message);
      if (errCreate) return op.failure(errCreate);
      updatedMessageId = messageId;
    }

    // Handle 'update-message'
    else if (event.name === "update-message") {
      const [errUpdate, messageId] = messages.update(event.data.id, event.data.message);
      if (errUpdate) return op.failure(errUpdate);
      updatedMessageId = messageId;
    }

    // Handle 'remove-message'
    else if (event.name === "remove-message") {
      const [errRemove, messageId] = messages.remove(event.data.id);
      if (errRemove) return op.failure(errRemove);
      updatedMessageId = messageId;
    }

    // Append user text chunks to last user message, or create a new user message if the user was not speaking yet
    else if (event.name === "incoming-text") {
      const [errFind, message] = messages.findLastFromRoles(["user", "agent", "action"]);
      if (errFind) return op.failure(errFind);
      if (message?.role === "user") {
        const content = `${message.content}${event.data.chunk}`;
        const [errUpdate, messageId] = messages.update(message.id, { content });
        if (errUpdate) return op.failure(errUpdate);
        updatedMessageId = messageId;
      } else {
        const [errCreate, messageId] = messages.create({
          role: "user",
          content: event.data.chunk,
        });
        if (errCreate) return op.failure(errCreate);
        updatedMessageId = messageId;
      }
    }

    // Handle agent tool requests
    // else if (event.name === "agent.tool-requests") {
    //   const message = op.dataOrThrow(messages.findLastFromRoles(["user", "agent"]));
    //   if (message?.role === "agent") {
    //     const toolsRequests = [...message.toolsRequests, ...event.data.requests];
    //     updatedMessageId = op.dataOrThrow(
    //       messages.update(message.id, "agent", { toolsRequests }),
    //     );
    //   } else {
    //     updatedMessageId = op.dataOrThrow(
    //       messages.create({ role: "agent", toolsRequests: event.data.requests }),
    //     );
    //   }
    // }

    // Handle user interruptions
    else if (event.name === "interruption") {
      const [errFind, message] = messages.findLastFromRoles(["agent"]);
      if (errFind) return op.failure(errFind);
      if (!message)
        return op.failure({
          code: "NotFound",
          message: "No agent message found. Should not happen.",
        });
      if (!message.content.includes("[Interrupted")) {
        const content = `${message.content} [Interrupted by ${event.data.author}]`;
        const [errUpdate, messageId] = messages.update(message.id, { content });
        if (errUpdate) return op.failure(errUpdate);
        updatedMessageId = messageId;
      }
    }

    // Handle agent text chunks
    else if (event.name === "outgoing-text") {
      const [errFind, message] = messages.findLastFromRoles(["user", "agent", "action"]);
      if (errFind) return op.failure(errFind);
      if (message?.role === "agent" && !message.content.includes("[Interrupted")) {
        const content = `${message.content}${event.data.chunk}`;
        const [errUpdate, messageId] = messages.update(message.id, { content });
        if (errUpdate) return op.failure(errUpdate);
        updatedMessageId = messageId;
      }
    }
    // else if (event.name === "agent.thinking-start") {
    //   const [errCreate, messageId] = messages.create({ role: "agent" });
    //   if (errCreate) return op.failure(errCreate);
    //   updatedMessageId = messageId;
    // }

    // Save the modified messages
    const messagesRaw = op.dataOrThrow(messages.getAll());
    const [errSet] = context.set((ctx) => ({ ...ctx, messages: messagesRaw }));
    if (errSet) return op.failure(errSet);
    return op.success(updatedMessageId);
  },
});
