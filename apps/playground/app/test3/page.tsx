"use client";
import type { Message } from "life/client";
import { useAgent, useAgentMessages } from "life/react";

export default function Page() {
  const agent = useAgent("example");
  const messages = useAgentMessages(agent);

  const sendMessage = async (message: string) => {
    await agent?.generation.messages.create({ message: { role: "user", content: message } });
    await agent?.generation.continue({});
  };

  const formatMessage = (message: Message) => {
    if (message.role === "user") return `User: ${message.content}`;
    if (message.role === "agent") return `Agent: ${message.content}`;
    if (message.role === "system") return `System: ${message.content}`;
    if (message.role === "tool-response") return `Tool response: ${JSON.stringify(message)}`;
    return "⚠️ Unknown message.";
  };

  return (
    <div>
      <h1>Example Agent</h1>

      <button onClick={() => agent?.start({ userId: "456" })} type="button">
        Invite
      </button>

      <input
        onBlur={(e) => sendMessage(e.target.value)}
        placeholder="Ask something..."
        type="text"
      />

      <p>Messages:</p>
      {messages.map((message) => (
        <p key={message.id}>{formatMessage(message)}</p>
      ))}
    </div>
  );
}
