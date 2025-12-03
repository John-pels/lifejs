// biome-ignore-all lint: a

"use client";

import { Markdown } from "life/react";
import { useState } from "react";
import { Streamdown } from "streamdown";

/*
  1. When implementing real-time text generation
  2. With large language models, developers often 
  3. Encounter performance challenges.
  
  - Each word appears individually,
  - causing the UI to re-render frequently 
  - and potentially causing visual flickering or layout shifts.

  1. When implementing real-time text generation
2. With large language models, developers often 
3. Encounter performance challenges.

test
- Each word appears individually,
- causing the UI to re-render frequently 
- and potentially causing visual flickering or layout shifts.

*/

const exampleTokens = `
# Flowchart Example
This is a sample **paragraph**.

The constant re-rendering of React components as new tokens arrive can lead to janky user experiences, especially on lower-end devices. 
This demo simulates that exact scenario by streaming words at regular intervals, mimicking how an LLM would send tokens over a WebSocket connection. The flickering becomes more pronounced with longer text content and faster streaming rates. 

1. When implementing real-time text generation
2. With large language models, developers often 
3. Encounter performance challenges.

- Each word appears individually,
- causing the UI to re-render frequently 
- and potentially causing visual flickering or layout shifts.

1. When implementing real-time text generation
2. With large language models, developers often 
3. Encounter performance challenges.

test
- Each word appears individually,
- causing the UI to re-render frequently 
- and potentially causing visual flickering or layout shifts.
  `.split(" ");

const newId = () => Math.random().toString(36).substring(2, 15);

type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
};

const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const sendMessage = async (content: string) => {
    setMessages((prev) => [...prev, { id: newId(), role: "user", content }]);
    const id = newId();
    setMessages((prev) => [...prev, { id, role: "agent", content: "" }]);
    for (const token of exampleTokens) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content: `${m.content}${m.content && " "}${token}` } : m,
        ),
      );
    }
  };
  return { sendMessage, messages };
};

const FormattedMessage = ({ message }: { message: Message }) => {
  return (
    <div className={`rounded p-4 flex flex-col gap-2`}>
      <div className="text-xs text-gray-500">{message.role === "user" ? "User" : "Agent"}</div>
      <p className="whitespace-pre-wrap leading-relaxed">
        {message.content.split(" ").map((word, i) => (
          <span>{`${i > 0 ? " " : ""}${word}`}</span>
        ))}
      </p>
      <div className="whitespace-nowrap text-xs w-min text-gray-500 p-3 border border-blue-200 rounded flex justify-center items-center bg-blue-100">
        A static component
      </div>
    </div>
  );
};

export default function ReproPage() {
  const { sendMessage, messages } = useMessages();
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Messages */}
      <div className="flex min-h-screen flex-col p-10 px-50 pb-40 gap-10">
        {messages.map((message) => (
          <div className="flex flex-col gap-2" key={message.id}>
            <p className="text-xs text-gray-500">{message.role === "user" ? "User" : "Agent"}</p>
            <Markdown cacheKey={message.id}>{message.content}</Markdown>
          </div>
        ))}
      </div>

      {/* Input & Send */}
      <div className="w-full gap-2 fixed bottom-0 left-0 right-0 flex justify-center items-center p-10 px-50">
        <input
          className="flex-1 rounded border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          type="text"
          value={input}
        />
        <button
          className="cursor-pointer rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          onClick={handleSend}
          type="button"
        >
          Send
        </button>
      </div>
    </>
  );
}
