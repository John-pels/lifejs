"use client";

import { useStore } from "@nanostores/react";
import { type AgentClientParam, type Message, parseAgentClientParam } from "life/client";
import { useAgent, useAgentMessages, useAgentStatus } from "life/react";
import { atom } from "nanostores";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import type { testPluginClient } from "@/agents/example/plugins/test/client";

const StatusIndicator = ({ label, active }: { label: string; active: boolean }) => (
  <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs">
    <div
      className={`h-2 w-2 rounded-full transition-colors duration-300 ${active ? "bg-green-500" : "bg-gray-300"}`}
    />
    <span className={active ? "text-black" : "text-gray-600"}>{label}</span>
  </div>
);

const useItem = <Agent extends AgentClientParam<[typeof testPluginClient]> | null>(
  agent: Agent,
  item: Agent extends AgentClientParam
    ? Agent["test"]["$types"]["serverConfig"]["items"][number]
    : never,
) => {
  const typedAgent = parseAgentClientParam(agent);
  const store = useMemo(
    () => typedAgent?.test.atoms.item(item).store ?? atom(null),
    [typedAgent, item],
  );
  const data = useStore(store);
  return data;
};

export default function Page() {
  const agent = useAgent("example");
  // agent?.test.getConnector("connector1");
  // agent?.test.getItem("item1");
  useItem(agent, "item1");

  const messages = useAgentMessages(agent);
  const status = useAgentStatus(agent);
  const [inputValue, setInputValue] = useState("");
  const isStarted = status?.listening || status?.thinking || status?.speaking;

  const formatMessage = (message: Message) => {
    let content: string;
    if (message.role === "user" || message.role === "agent") {
      content = message.content;
    } else if (message.role === "tool") content = JSON.stringify(message);
    else return null;
    return { content, role: message.role };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    await agent?.generation.interrupt({ reason: "New user message", author: "user" });
    await agent?.generation.messages.create({ message: { role: "user", content: inputValue } });
    await agent?.generation.continue({});
    setInputValue("");
  };

  const handleInterrupt = useCallback(async () => {
    await agent?.generation.interrupt({ reason: "User interrupted", author: "user" });
  }, [agent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (status?.thinking || status?.speaking)) {
        e.preventDefault();
        handleInterrupt();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status?.thinking, status?.speaking, handleInterrupt]);

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
            Start&nbsp;&nbsp;<span className="text-gray-400 text-xs">▶</span>
          </button>
          <div className="flex flex-wrap gap-2">
            <StatusIndicator active={!!status?.listening} label="Listening" />
            <StatusIndicator active={!!status?.thinking} label="Thinking" />
            <StatusIndicator active={!!status?.speaking} label="Speaking" />
          </div>
          <button
            className="cursor-pointer rounded-full border border-gray-200 bg-transparent px-3.5 py-1.5 text-[13px] text-gray-600 transition-opacity duration-200 hover:opacity-70 focus:opacity-70"
            onClick={() => agent?.enableVoiceIn()}
            type="button"
          >
            Enable Microphone
          </button>
        </div>
      </div>

      <div className="mb-6 flex min-h-[400px] flex-1 flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center font-light text-gray-400 text-sm">
            No messages
          </div>
        ) : (
          messages.map((message) => {
            const result = formatMessage(message);
            if (!result) return null;
            const { content, role } = result;
            const isUser = role === "user";

            return (
              <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} key={message.id}>
                <div
                  className={`max-w-[75%] break-words rounded-[18px] px-4 py-3 text-sm leading-relaxed ${
                    isUser ? "bg-black text-white" : "bg-gray-100 text-black"
                  }`}
                >
                  <Streamdown>{content}</Streamdown>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form className="flex items-center gap-3" onSubmit={handleSubmit}>
        <input
          className="flex-1 rounded-3xl border border-gray-200 bg-white px-4.5 py-3.5 text-sm outline-none transition-colors focus:border-black"
          disabled={!isStarted}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={isStarted ? "Message..." : "Agent not started."}
          type="text"
          value={inputValue}
        />
        <button
          className={`flex h-11 w-11 items-center justify-center rounded-full border-none bg-black text-lg text-white transition-opacity duration-200 ${
            inputValue.trim()
              ? "cursor-pointer opacity-100 hover:opacity-70"
              : "cursor-default opacity-30"
          }`}
          disabled={!(inputValue.trim() && isStarted)}
          type="submit"
        >
          ↑
        </button>
        <button
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-transparent transition-opacity duration-200 ${
            status?.thinking || status?.speaking
              ? "cursor-pointer opacity-100 hover:opacity-70"
              : "cursor-default opacity-30"
          }`}
          disabled={!(status?.thinking || status?.speaking)}
          onClick={handleInterrupt}
          type="button"
        >
          <div className="h-3.5 w-3.5 bg-black" />
        </button>
      </form>
    </div>
  );
}
