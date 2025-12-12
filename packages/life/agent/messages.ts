import { z } from "zod";
import { deepClone } from "@/shared/deep-clone";
import { newId } from "@/shared/id";
import * as op from "@/shared/operation";

// Base message
export const baseMessageSchema = {
  id: z.string(),
  createdAt: z.number(),
  lastUpdated: z.number(),
  hideFrom: z.enum(["user", "agent", "all"]).optional(),
};

// User message
export const userMessageSchema = z.object({
  ...baseMessageSchema,
  role: z.literal("user"),
  content: z.string().prefault(""),
});
export type UserMessage = z.output<typeof userMessageSchema>;

// System message
export const systemMessageSchema = z.object({
  ...baseMessageSchema,
  role: z.literal("system"),
  content: z.string().prefault(""),
});
export type SystemMessage = z.output<typeof systemMessageSchema>;

// Agent message
export const agentActionRequestSchema = z.object({
  actionId: z.string(),
  actionName: z.string(),
  actionInput: z.record(z.string(), z.any()),
});
export type AgentActionRequest = z.output<typeof agentActionRequestSchema>;
export const agentMessageSchema = z.object({
  ...baseMessageSchema,
  role: z.literal("agent"),
  content: z.string().prefault(""),
  actions: z.array(agentActionRequestSchema).prefault([]),
});
export type AgentMessage = z.output<typeof agentMessageSchema>;

// Action message
export const actionMessageSchema = z.object({
  ...baseMessageSchema,
  role: z.literal("action"),
  actionId: z.string(),
  actionName: z.string(),
  actionSuccess: z.boolean(),
  actionOutput: z.record(z.string(), z.any()).optional(),
  actionError: z.string().optional(),
});
export type ActionResponseMessage = z.output<typeof actionMessageSchema>;

// Message
export const messageSchema = z.discriminatedUnion("role", [
  userMessageSchema,
  systemMessageSchema,
  agentMessageSchema,
  actionMessageSchema,
]);

export type Message = z.output<typeof messageSchema>;

// Create message input
const createOmitFields = { createdAt: true, lastUpdated: true, id: true } as const;
export const createMessageInputSchema = z.discriminatedUnion("role", [
  userMessageSchema.omit(createOmitFields),
  systemMessageSchema.omit(createOmitFields),
  agentMessageSchema.omit(createOmitFields),
  actionMessageSchema.omit(createOmitFields),
]);
export type CreateMessageInput = z.input<typeof createMessageInputSchema>;

// Update message input
const updateOmitFields = { createdAt: true, lastUpdated: true, id: true } as const;
export const updateMessageInputSchema = z.discriminatedUnion("role", [
  userMessageSchema
    .omit(updateOmitFields)
    .partial()
    .extend({ role: z.literal("user") }),
  systemMessageSchema
    .omit(updateOmitFields)
    .partial()
    .extend({ role: z.literal("system") }),
  agentMessageSchema
    .omit(updateOmitFields)
    .partial()
    .extend({ role: z.literal("agent") }),
  actionMessageSchema
    .omit(updateOmitFields)
    .partial()
    .extend({ role: z.literal("action") }),
]);
export type UpdateMessageInput<T extends Message["role"]> = Extract<
  z.input<typeof updateMessageInputSchema>,
  { role: T }
>;

/**
 * A helper class aimed at facilitating safe and efficient
 * manipulation of an array of messages.
 * @param messages - Optionally, the messages to initialize the list with.
 */
export class MessageList {
  #messages: Message[] = [];

  constructor(messages?: Message[]) {
    this.#messages = deepClone(messages ?? []);
  }

  getAll() {
    return op.attempt(() => deepClone(this.#messages));
  }

  get(id: string) {
    const [err, messages] = this.getAll();
    if (err) return op.failure(err);
    return op.success(messages.find((message) => message.id === id));
  }

  findLastFromRoles<R extends Message["role"]>(roles: readonly R[]) {
    const [err, messages] = this.getAll();
    if (err) return op.failure(err);
    const lastMessage = messages.reverse().find((message) => roles.includes(message.role as R)) as
      | Extract<Message, { role: R }>
      | undefined;
    return op.success(lastMessage);
  }

  create(message: CreateMessageInput) {
    // Validate the message input
    const { data: validatedMessage, error: validatedMessageError } =
      createMessageInputSchema.safeParse(message);
    if (validatedMessageError)
      return op.failure({
        code: "Validation",
        message: "Invalid message shape.",
        cause: validatedMessageError,
      });

    // Else, create and insert the message
    const newMessage: Message = {
      ...validatedMessage,
      id: newId("message"),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    this.#messages.push(newMessage);

    // Return the message id
    return op.success(newMessage.id);
  }

  update<Role extends Message["role"]>(
    id: string,
    role: Role,
    message: Omit<UpdateMessageInput<Role>, "role">,
  ) {
    // Validate the message input (include role for discriminated union)
    const { data: validatedMessage, error: validationError } = updateMessageInputSchema.safeParse({
      ...message,
      role,
    });
    if (validationError)
      return op.failure({
        code: "Validation",
        message: "Invalid message shape.",
        cause: validationError,
      });

    // If the message does not exist, return a failure
    const [err, existingMessage] = this.get(id);
    if (err) return op.failure(err);
    if (!existingMessage)
      return op.failure({
        code: "NotFound",
        message: `Message with id '${id}' does not exist.`,
      });

    // Ensure the role is matching the message role
    if (existingMessage.role !== role)
      return op.failure({
        code: "Validation",
        message: "Invalid message role provided.",
        cause: new Error(`Message with id '${id}' is not a ${role} message.`),
      });

    // Build the new message object
    const newMessage = {
      ...existingMessage,
      ...validatedMessage,
      lastUpdated: Date.now(),
    } as Message;

    // Update the message in the list
    this.#messages = this.#messages.map((m) => (m.id === id ? newMessage : m));

    // Return the message id
    return op.success(id);
  }
}
