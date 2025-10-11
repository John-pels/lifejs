"use client";

import type { Message } from "life/client";
import { useAgent, useAgentMessages, useAgentStatus } from "life/react";
import { useState } from "react";

const StatusIndicator = ({ label, active }: { label: string; active: boolean }) => (
  <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs">
    <div
      className={`h-2 w-2 rounded-full transition-colors duration-300 ${active ? "bg-green-500" : "bg-gray-300"}`}
    />
    <span className={active ? "text-black" : "text-gray-600"}>{label}</span>
  </div>
);

export default function Page() {
  const agent = useAgent("example");
  const messages = useAgentMessages(agent);
  const status = useAgentStatus(agent);
  const [inputValue, setInputValue] = useState("");

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    await agent?.generation.messages.create({ message: { role: "user", content } });
    // await agent?.generation.continue({});
    setInputValue("");
  };

  const formatMessage = (message: Message) => {
    let content: string;

    if (message.role === "user" || message.role === "agent" || message.role === "system") {
      content = message.content;
    } else if (message.role === "tool-response") content = JSON.stringify(message);
    else content = "⚠️ Unknown";

    return { content, role: message.role };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[680px] flex-col px-6 py-10 font-sans">
      <div className="mb-12">
        <h1 className="mb-3 font-light text-[28px] text-black tracking-tight">Example Agent</h1>
        <div className="mb-4 flex items-center gap-2">
          <button
            className="cursor-pointer rounded-full border border-gray-200 bg-transparent px-3.5 py-1.5 text-[13px] text-gray-600 transition-opacity duration-200 hover:opacity-70 focus:opacity-70"
            onClick={() => agent?.start({ userId: "456" })}
            type="button"
          >
            Connect
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusIndicator active={!!agent?.isStarted} label="Started" />
          <StatusIndicator active={!!status?.listening} label="Listening" />
          <StatusIndicator active={!!status?.thinking} label="Thinking" />
          <StatusIndicator active={!!status?.speaking} label="Speaking" />
        </div>
      </div>

      <div className="mb-6 flex min-h-[400px] flex-1 flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center font-light text-gray-400 text-sm">
            No messages
          </div>
        ) : (
          messages.map((message) => {
            const { content, role } = formatMessage(message);
            const isUser = role === "user";

            return (
              <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} key={message.id}>
                <div
                  className={`max-w-[75%] break-words rounded-[18px] px-4 py-3 text-sm leading-relaxed ${
                    isUser ? "bg-black text-white" : "bg-gray-100 text-black"
                  }`}
                >
                  {content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form className="flex items-center gap-3" onSubmit={handleSubmit}>
        <input
          className="flex-1 rounded-3xl border border-gray-200 bg-white px-4.5 py-3.5 text-sm outline-none transition-colors focus:border-black"
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Message..."
          type="text"
          value={inputValue}
        />
        <button
          className={`flex h-11 w-11 items-center justify-center rounded-full border-none bg-black text-lg text-white transition-opacity duration-200 ${
            inputValue.trim()
              ? "cursor-pointer opacity-100 hover:opacity-70"
              : "cursor-default opacity-30"
          }`}
          type="submit"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
