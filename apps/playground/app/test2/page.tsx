"use client";

import { useAgent, useAgentStatus } from "life/react";

export default function Page() {
  const agent = useAgent("example");
  const status = useAgentStatus(agent);

  return (
    <div>
      <h1>Example Agent</h1>
      <p>Is started: {agent?.isStarted ? "Yes" : "No"}</p>
      <p>Listening: {status?.listening ? "Yes" : "No"}</p>
      <p>Thinking: {status?.thinking ? "Yes" : "No"}</p>
      <p>Speaking: {status?.speaking ? "Yes" : "No"}</p>
      <button onClick={() => agent?.start({ userId: "456" })} type="button">
        Invite
      </button>
      <h3>Status</h3>
    </div>
  );
}
