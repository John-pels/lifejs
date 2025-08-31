import { z } from "zod";
import { audioChunkToMs } from "@/shared/audio-chunk-to-ms";
import { canon } from "@/shared/canon";
import { History } from "@/shared/history";
import {
  createMessageInputSchema,
  messageSchema,
  resourcesSchema,
  toolRequestsSchema,
  toolResponseMessageSchema,
  toolSchema,
  updateMessageInputSchema,
} from "@/shared/resources";
import { RollingBuffer } from "@/shared/rolling-buffer";
import { definePlugin } from "../../server/define";
import { GenerationOrchestrator } from "./orchestrator";

export const generationPlugin = definePlugin("generation")
  .config(
    z.object({
      collections: z.array(z.string()),
      tools: z.array(toolSchema).default([
        {
          name: "get-weather",
          description: "Get the weather for a given city",
          inputSchema: z.object({
            city: z.string(),
          }),
          outputSchema: z.object({
            weather: z.string(),
          }),
          run: () => {
            return {
              success: true,
              output: {
                weather: "Sunny",
              },
            };
          },
        },
      ]),
      voiceDetection: z
        .object({
          scoreInThreshold: z.number().default(0.5),
          scoreOutThreshold: z.number().default(0.25),
          prePaddingChunks: z.number().default(50),
          /**
           * Many STT models listen at silent chunks after voice chunks before returning
           * their final transcription result. Deepgram for example, even with `endpointing: 0` and
           * `no_delay: true`, still seems to require a good amount of silent post padding chunks to
           * return a transcript. 50 post-padding chunks wasn't enough and was leading to Deepgram getting
           * stuck sometimes (i.e., never returning transcript). Note that this value could impact
           * latency, since the user's end of turn won't be considered until user voice end is observed,
           * which is delayed by the post-padding chunks. Still, since the pipeline also have to awaits
           * for the STT model, if this value is lower than the latency of the STT model, it will have
           * no impact on latency. For now this value is set at 200 by default, which as been found to
           * be a good balance between latency and stability with most STT providers.
           *
           * You could considering lowering this value to 50 depending on how your STT provider behaves.
           * As always, benchmark carefully the change.
           */
          postPaddingChunks: z.number().default(200),
          interruptMinDurationMs: z.number().default(50),
        })
        .default({}),
      endOfTurnDetection: z
        .object({
          threshold: z.number().default(0.6),
          minTimeoutMs: z.number().default(300),
          maxTimeoutMs: z.number().default(5000),
        })
        .default({}),
    }),
  )
  .events({
    "messages.create": { dataSchema: createMessageInputSchema },
    "messages.update": { dataSchema: updateMessageInputSchema },
    "messages.changed": { dataSchema: z.array(messageSchema) },
    "user.audio-chunk": { dataSchema: z.object({ audioChunk: z.custom<Int16Array>() }) },
    "user.voice-start": {},
    "user.voice-chunk": {
      dataSchema: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("voice"),
          voiceChunk: z.custom<Int16Array>(),
        }),
        z.object({
          type: z.literal("padding"),
          voiceChunk: z.custom<Int16Array>(),
          paddingSide: z.enum(["pre", "post"]),
          paddingIndex: z.number(),
        }),
      ]),
    },
    "user.voice-end": {},
    "user.text-chunk": { dataSchema: z.object({ textChunk: z.string() }) },
    "user.interrupted": {},
    "agent.resources-request": {},
    "agent.resources-response": { dataSchema: resourcesSchema.extend({ requestId: z.string() }) },
    "agent.continue": {
      dataSchema: z.object({
        interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
        preventInterruption: z.boolean().optional(),
      }),
    },
    "agent.decide": {
      dataSchema: z.object({
        messages: z.array(messageSchema),
        interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
        preventInterruption: z.boolean().optional(),
      }),
    },
    "agent.say": {
      dataSchema: z.object({
        text: z.string(),
        interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
        preventInterruption: z.boolean().optional(),
      }),
    },
    "agent.interrupt": {
      dataSchema: z.object({
        reason: z.string(),
        author: z.enum(["user", "application"]),
        force: z.boolean().optional(),
      }),
    },
    "agent.tool-requests": { dataSchema: toolRequestsSchema },
    "agent.tool-response": {
      dataSchema: z.object({
        result: toolResponseMessageSchema.omit({
          createdAt: true,
          lastUpdated: true,
          id: true,
          role: true,
        }),
      }),
    },
    "agent.interrupted": {
      dataSchema: z.object({
        reason: z.string(),
        forced: z.boolean(),
        author: z.enum(["user", "application"]),
      }),
    },
    "agent.text-chunk": { dataSchema: z.object({ textChunk: z.string() }) },
    "agent.voice-chunk": { dataSchema: z.object({ voiceChunk: z.custom<Int16Array>() }) },
    "agent.speaking-start": {}, // start of output stream
    "agent.speaking-end": {}, // end of output stream
    "agent.thinking-start": {}, // start of generation
    "agent.thinking-end": {}, // end of generation
  })
  .context(
    z.object({
      messages: z.array(messageSchema).default([]),
      status: z
        .object({
          listening: z.boolean().default(true),
          thinking: z.boolean().default(false),
          speaking: z.boolean().default(false),
        })
        .default({}),
      voiceEnabled: z.boolean().default(true),
    }),
  )
  .methods({
    getMessages: {
      schema: z.function().returns(z.array(messageSchema)),
      run: ({ context }) => context.get().messages,
    },
    createMessage: {
      schema: z.function().args(createMessageInputSchema).returns(z.string()),
      run: ({ events }, message) =>
        events.emit({ type: "messages.create", data: message, urgent: true }),
    },
    updateMessage: {
      schema: z.function().args(updateMessageInputSchema).returns(z.string()),
      run: ({ events }, message) =>
        events.emit({ type: "messages.update", data: message, urgent: true }),
    },
    continue: {
      schema: z
        .function()
        .args(
          z.object({
            interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
            preventInterruption: z.boolean().optional(),
          }),
        )
        .returns(z.string()),
      run: ({ events }, params) =>
        events.emit({ type: "agent.continue", data: params, urgent: true }),
    },
    decide: {
      schema: z
        .function()
        .args(
          z.object({
            messages: z.array(messageSchema),
            interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
            preventInterruption: z.boolean().optional(),
          }),
        )
        .returns(z.string()),
      run: ({ events }, params) =>
        events.emit({ type: "agent.decide", data: params, urgent: true }),
    },
    say: {
      schema: z
        .function()
        .args(
          z.object({
            text: z.string(),
            interrupt: z.enum(["abrupt", "smooth"]).or(z.literal(false)).optional(),
            preventInterruption: z.boolean().optional(),
          }),
        )
        .returns(z.string()),
      run: ({ events }, params) => events.emit({ type: "agent.say", data: params, urgent: true }),
    },
    interrupt: {
      schema: z
        .function()
        .args(
          z.object({
            reason: z.string(),
            author: z.enum(["user", "application"]),
            force: z.boolean().optional(),
          }),
        )
        .returns(z.string()),
      run: ({ events }, params) =>
        events.emit({ type: "agent.interrupt", data: params, urgent: true }),
    },
  })
  .lifecycle({
    onStart: ({ context, events, telemetry }) => {
      // Log status changes
      context.onChange(
        (ctx) => ctx.status,
        (newStatus) => telemetry.log.info({ message: `🔄 ${newStatus}` }),
      );

      // Log messages changes
      context.onChange(
        (ctx) => ctx.messages,
        (newMessages) => telemetry.log.info({ message: `💬 ${newMessages}` }),
      );

      // Emit messages changed event
      context.onChange(
        (ctx) => ctx.messages,
        (newMessages) => events.emit({ type: "messages.changed", data: newMessages }),
      );
    },
  })
  // 1. Handle agent' status changes
  .addEffect("handle-status", ({ event, context }) => {
    if (event.type === "agent.thinking-start") {
      context.set("status", (prev) => ({ ...prev, listening: false, thinking: true }));
    } else if (event.type === "agent.thinking-end") {
      context.set("status", (prev) => ({ ...prev, thinking: false }));
    } else if (event.type === "agent.speaking-end")
      context.set("status", { listening: true, thinking: false, speaking: false });
    else if (event.type === "agent.speaking-start") {
      context.set("status", (prev) => ({ ...prev, listening: false, speaking: true }));
    }
  })
  // 2. Maintain messages history
  .addEffect("handle-messages", ({ event, context }) => {
    // Build the history instance
    const history = new History(context.get().messages);
    // Handle direct history message creation requests
    if (event.type === "messages.create") history.createMessage(event.data);
    // Handle direct history message update requests
    else if (event.type === "messages.update") history.updateMessage(event.data);
    // Handle user text chunk
    else if (event.type === "user.text-chunk") {
      // If the last subject message is from user, append the text chunk to it
      const lastSubjectMessage = history.findLastMessageOfRole(["user", "agent", "tool-response"]);
      if (lastSubjectMessage?.role === "user") {
        history.appendContentToUserMessage(lastSubjectMessage.id, event.data.textChunk);
      }
      // Else, create a new user message
      else history.createMessage({ role: "user", content: event.data.textChunk });
    }
    // Handle user interruptions
    else if (event.type === "user.interrupted") {
      const lastUserMessage = history.findLastMessageOfRole("user");
      if (!lastUserMessage) throw new Error("No user message found. Should not happen.");
      history.appendContentToUserMessage(
        lastUserMessage.id,
        "[You interrupted the user, you might want to quickly apologize or mention that]",
      );
    }
    // Handle agent tool requests
    else if (event.type === "agent.tool-requests") {
      const lastSubjectMessage = history.findLastMessageOfRole(["user", "agent"]);
      if (lastSubjectMessage?.role === "agent") {
        history.addToolRequestsToAgentMessage(lastSubjectMessage.id, event.data);
      } else {
        history.createMessage({ role: "agent", content: "", toolsRequests: event.data });
      }
    }
    // Handle agent tool responses
    else if (event.type === "agent.tool-response") {
      history.createMessage({ ...event.data.result, role: "tool-response" });
    }
    // Handle agent interruptions
    else if (event.type === "agent.interrupted") {
      const lastAgentMessage = history.findLastMessageOfRole("agent");
      if (!lastAgentMessage) throw new Error("No agent message found. Should not happen.");
      if (lastAgentMessage.role !== "agent") return; // for typesafety below
      if (!lastAgentMessage.content.includes("[Interrupted")) {
        history.appendContentToAgentMessage(
          lastAgentMessage.id,
          `[Interrupted by ${event.data.author}]`,
        );
      }
    }
    // Handle agent text chunks
    else if (event.type === "agent.text-chunk") {
      // If the last subject message is from agent, append the text chunk to it
      const lastSubjectMessage = history.findLastMessageOfRole(["user", "agent", "tool-response"]);
      if (lastSubjectMessage?.role === "agent") {
        if (!lastSubjectMessage.content.includes("[Interrupted")) {
          history.appendContentToAgentMessage(lastSubjectMessage.id, event.data.textChunk);
        }
      }
      // Else, create a new agent message
      else history.createMessage({ role: "agent", content: event.data.textChunk });
    }

    // Save the modified messages array
    context.set("messages", history.getMessages());
  })
  // 3. Listen for incoming audio chunks coming from the WebRTC room
  .addService("incoming-audio", ({ agent, events }) => {
    agent.transport.on("audio-chunk", (event) => {
      events.emit({ type: "user.audio-chunk", data: { audioChunk: event.chunk } });
    });
    return new Promise((resolve) => process.once("SIGINT", () => resolve()));
  })
  // 4. Use VAD model to detect voice activity
  .addService("detect-voice", async ({ queue, agent, events, config, context }) => {
    const SCORE_IN_THRESHOLD = config.voiceDetection.scoreInThreshold;
    const SCORE_OUT_THRESHOLD = config.voiceDetection.scoreOutThreshold;
    const PRE_PADDING_CHUNKS = config.voiceDetection.prePaddingChunks;
    const POST_PADDING_CHUNKS = config.voiceDetection.postPaddingChunks;
    const INTERRUPT_MIN_DURATION_MS = config.voiceDetection.interruptMinDurationMs;

    let inSpeech = false;
    const prePaddingBuffer = new RollingBuffer<Int16Array>(PRE_PADDING_CHUNKS);
    let postPaddingCount = POST_PADDING_CHUNKS;
    // Keeps track of 3x the min. interruption duration in audio chunks
    const interruptBuffer = new RollingBuffer<Int16Array>((INTERRUPT_MIN_DURATION_MS / 10) * 3);

    // Sliding window for voice chunks to handle VAD imperfections
    let voiceChunksWindow: Array<{ timestamp: number; duration: number }> = [];
    const VOICE_WINDOW_MS = INTERRUPT_MIN_DURATION_MS * 2;

    // Helper to calculate current interrupt duration from sliding window
    const getCurrentInterruptDuration = () => {
      const now = Date.now();
      // Remove chunks older than the window
      voiceChunksWindow = voiceChunksWindow.filter((c) => now - c.timestamp <= VOICE_WINDOW_MS);
      // Sum up durations of remaining chunks
      return voiceChunksWindow.reduce((sum, chunk) => sum + chunk.duration, 0);
    };

    // Listen to user audio chunks
    for await (const event of queue) {
      if (event.type !== "user.audio-chunk") continue;

      // Helper method to emit a voice chunk
      const emitVoiceChunk = (
        data:
          | { type: "voice"; voiceChunk: Int16Array }
          | {
              type: "padding";
              voiceChunk: Int16Array;
              paddingSide: "pre" | "post";
              paddingIndex: number;
            },
      ) => events.emit({ type: "user.voice-chunk", data });

      // Check if the chunk contains voice
      const score = await agent.models.vad.checkActivity(event.data.audioChunk);
      const inSpeechBefore = inSpeech;
      inSpeech = score > (inSpeech ? SCORE_IN_THRESHOLD : SCORE_OUT_THRESHOLD);
      const inSpeechChanged = inSpeech !== inSpeechBefore;

      // If the agent is currently listening
      if (context.get().status.listening) {
        // If the current chunk contains voice
        if (inSpeech) {
          // Reset post-padding count for the new voice session
          postPaddingCount = 0;

          // Emit the voice start event
          if (inSpeechChanged && prePaddingBuffer.length() > 0)
            events.emit({ type: "user.voice-start" });

          // Emit the pre-padding chunks
          for (let i = prePaddingBuffer.length() - 1; i >= 0; i--) {
            const voiceChunk = prePaddingBuffer.get()[i];
            if (!voiceChunk) continue;
            emitVoiceChunk({
              type: "padding",
              voiceChunk,
              paddingSide: "pre",
              paddingIndex: i,
            });
          }
          prePaddingBuffer.empty();

          // Emit the voice chunk
          emitVoiceChunk({ voiceChunk: event.data.audioChunk, type: "voice" });
        }
        // Else, emit the current chunk if post-padding limit is not met yet
        else if (postPaddingCount < POST_PADDING_CHUNKS) {
          emitVoiceChunk({
            voiceChunk: event.data.audioChunk,
            type: "padding",
            paddingSide: "post",
            paddingIndex: postPaddingCount,
          });
          postPaddingCount++;
          if (postPaddingCount === POST_PADDING_CHUNKS) {
            events.emit({ type: "user.voice-end" });
          }
        }
        // Else, add the current chunk to the pre-padding buffer
        else prePaddingBuffer.add(event.data.audioChunk);
      }

      // Or if the agent wasn't listening already
      else {
        // Buffer the audio chunk
        interruptBuffer.add(event.data.audioChunk);

        // If voice is detected, add to sliding window
        if (inSpeech) {
          const duration = audioChunkToMs(event.data.audioChunk);
          voiceChunksWindow.push({
            timestamp: Date.now(),
            duration,
          });
        }

        // If the interruption duration is long enough, abort and emit all accumulated voice chunks
        if (getCurrentInterruptDuration() >= INTERRUPT_MIN_DURATION_MS) {
          events.emit({
            type: "agent.interrupt",
            data: { reason: "The user is speaking", author: "user" },
            urgent: true,
          });
          events.emit({ type: "user.voice-start" });
          for (const voiceChunk of interruptBuffer.get()) {
            emitVoiceChunk({ voiceChunk, type: "voice" });
          }
          interruptBuffer.empty();
          voiceChunksWindow.length = 0; // Clear the sliding window
        }
      }
    }
  })
  // 5. Use STT model to transcribe user voice
  .addService("transcribe-audio", async ({ queue, agent, events }) => {
    const sttJob = await agent.models.stt.generate();

    // Receive transcribe text chunk and emit those
    (async () => {
      for await (const chunk of sttJob.getStream()) {
        if (chunk.type === "content") {
          events.emit({ type: "user.text-chunk", data: { textChunk: chunk.textChunk } });
        }
      }
    })();

    // Push voice chunks to the STT model
    for await (const event of queue) {
      if (event.type !== "user.voice-chunk") continue;
      sttJob.pushVoice(event.data.voiceChunk);
    }
  })
  // 6. Use EOU model to detect user's end of turn
  .addService("detect-end-of-turn", async ({ queue, agent, events, config, context }) => {
    const END_OF_TURN_THRESHOLD = config.endOfTurnDetection.threshold;
    const MAX_TIMEOUT_MS = config.endOfTurnDetection.maxTimeoutMs;
    const MIN_TIMEOUT_MS = config.endOfTurnDetection.minTimeoutMs;
    let userIsSpeaking = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastMessageBuffer = "";

    // Helper method to check if the agent can answer
    const canAnswer = () => {
      if (userIsSpeaking) return false;
      if (!lastMessageBuffer.trim().length) return false;
      return true;
    };
    // Helper method to emit the current message buffer
    const answer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!canAnswer()) return;
      events.emit({ type: "agent.continue", data: { interrupt: "abrupt" }, urgent: true });
      lastMessageBuffer = "";
    };

    for await (const event of queue) {
      if (!context.get().status.listening) continue;

      // Handle voice related events and text chunks
      if (event.type === "user.voice-start") userIsSpeaking = true;
      else if (event.type === "user.voice-end") userIsSpeaking = false;
      else if (event.type === "user.text-chunk") lastMessageBuffer += event.data.textChunk;
      else continue;

      // Clear the timeout if it exists
      if (timeoutId) clearTimeout(timeoutId);

      // If the agent can't answer yet, continue
      if (!canAnswer()) continue;

      // Determine if the user has finished speaking
      const endOfTurnProbability = await agent.models.eou.predict(context.get().messages);

      // Emit the message if the user has finished speaking
      if (endOfTurnProbability >= END_OF_TURN_THRESHOLD) answer();
      // Else, set a timeout to emit the message after a delay
      else {
        timeoutId = setTimeout(
          answer,
          Math.max(
            MIN_TIMEOUT_MS,
            MAX_TIMEOUT_MS * (1 - endOfTurnProbability / END_OF_TURN_THRESHOLD),
          ),
        );
      }
    }
  })
  // 7. Handle generation operations
  .addService("handle-generation", (params) => {
    // Consider the complexity of the generation logic, it's offloaded to an orchestrator class for easier maintenance
    const orchestrator = new GenerationOrchestrator(params);
    orchestrator.start();
  })
  // 8. Handle resources requests
  .addEffect("handle-resources", ({ event, events, context, config }) => {
    if (event.type !== "agent.resources-request") return;
    events.emit({
      type: "agent.resources-response",
      data: { messages: context.get().messages, tools: config.tools, requestId: event.id },
    });
  })
  // 9. Handle tools executions
  .addEffect("handle-tools", async ({ event, events, config, methods }) => {
    if (event.type !== "agent.tool-requests") return;

    await Promise.all(
      event.data.map(async (request) => {
        const tool = config.tools.find((t) => t.name === request.name);
        if (!tool) throw new Error(`Tool with id "${request.name}" not found.`);

        try {
          const result = await tool.run(request.input);
          events.emit({
            type: "agent.tool-response",
            data: {
              result: {
                toolId: request.id,
                toolSuccess: result.success,
                toolOutput: result.output,
              },
            },
            urgent: true,
          });
        } catch (error) {
          events.emit({
            type: "agent.tool-response",
            data: {
              result: {
                toolId: request.id,
                toolSuccess: false,
                toolError: canon.stringify(error as Error),
              },
            },
            urgent: true,
          });
        }

        methods.continue({});
      }),
    );
  })
  // 10. Stream agent speech to the user
  .addService("outgoing-audio", async ({ queue, agent }) => {
    for await (const event of queue) {
      if (event.type !== "agent.voice-chunk") continue;
      agent.transport.streamAudioChunk(event.data.voiceChunk);
    }
  });
