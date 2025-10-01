"use client";

import type { Message } from "life/client";
import { useAgent, useAgentMessages } from "life/react";
import { useState } from "react";

export default function Page() {
  const agent = useAgent("example");
  const messages = useAgentMessages(agent);
  const [inputValue, setInputValue] = useState("");

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;
    await agent?.generation.messages.create({ message: { role: "user", content: message } });
    await agent?.generation.continue({});
    setInputValue("");
  };

  const formatMessage = (message: Message) => {
    const content =
      message.role === "user"
        ? message.content
        : message.role === "agent"
          ? message.content
          : message.role === "system"
            ? message.content
            : message.role === "tool-response"
              ? JSON.stringify(message)
              : "⚠️ Unknown";

    return { content, role: message.role };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  return (
    <div
      style={{
        maxWidth: "680px",
        margin: "0 auto",
        padding: "40px 24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginBottom: "48px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "300",
            letterSpacing: "-0.02em",
            color: "#000",
            marginBottom: "12px",
          }}
        >
          Example Agent
        </h1>
        <button
          onBlur={(e) => (e.currentTarget.style.opacity = "1")}
          onClick={() => agent?.start({ userId: "456" })}
          onFocus={(e) => (e.currentTarget.style.opacity = "0.7")}
          onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
          style={{
            padding: "6px 14px",
            backgroundColor: "transparent",
            color: "#666",
            border: "1px solid #e0e0e0",
            borderRadius: "20px",
            fontSize: "13px",
            fontWeight: "400",
            cursor: "pointer",
            transition: "opacity 0.2s ease",
            opacity: 1,
          }}
          type="button"
        >
          Connect
        </button>
      </div>

      <div
        style={{
          flex: 1,
          marginBottom: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          minHeight: "400px",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#999",
              fontSize: "14px",
              fontWeight: "300",
            }}
          >
            No messages
          </div>
        ) : (
          messages.map((message) => {
            const { content, role } = formatMessage(message);
            const isUser = role === "user";

            return (
              <div
                key={message.id}
                style={{
                  display: "flex",
                  justifyContent: isUser ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "12px 16px",
                    backgroundColor: isUser ? "#000" : "#f5f5f5",
                    color: isUser ? "#fff" : "#000",
                    borderRadius: "18px",
                    fontSize: "14px",
                    fontWeight: "400",
                    lineHeight: "1.5",
                    wordBreak: "break-word",
                  }}
                >
                  {content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#000")}
          placeholder="Message..."
          style={{
            flex: 1,
            padding: "14px 18px",
            border: "1px solid #e0e0e0",
            borderRadius: "24px",
            fontSize: "14px",
            fontWeight: "400",
            outline: "none",
            backgroundColor: "#fff",
            transition: "border-color 0.2s ease",
          }}
          type="text"
          value={inputValue}
        />
        <button
          onBlur={(e) => (e.currentTarget.style.opacity = "1")}
          onFocus={(e) => (e.currentTarget.style.opacity = "0.7")}
          onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
          style={{
            width: "44px",
            height: "44px",
            backgroundColor: "#000",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            fontSize: "18px",
            cursor: inputValue.trim() ? "pointer" : "default",
            opacity: inputValue.trim() ? 1 : 0.3,
            transition: "opacity 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          type="submit"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
