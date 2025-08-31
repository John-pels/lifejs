import { createAgentClient } from "life/client";
import { AgentProvider, useAgentStatus } from "life/react";

export default function Page() {
  return (
    <AgentProvider id="1" name="example">
      {/* serverUrl="ws://localhost:3003" */}
      <AgentInterface />
    </AgentProvider>
  );
}

const AgentInterface = () => {
  // const agent1 = useAgent("example", { id: "1" });
  const agent1 = createAgentClient("example");
  const { data: status } = useAgentStatus(agent1);
  // const test = agent1._definition.$serverDef.plugins.generation.methods;
  agent1.test.getItem("item1");
  agent1.test.getConnector("connector1");
  // --------------

  // DOESN'T WORK, METHODS ARE NOT TYPED CORRECTLY (ANY)
  agent1.generation.server.methods.continue({});
  // @ts-expect-error - Doesn't catch any error
  agent1.generation.server.methods.continueNot({});

  // --------------
  agent1.generation.server.events.on(
    {
      include: ["messages.create", "messages.update", "agent.decide"],
      exclude: ["messages.create", "messages.update"],
    },
    (event) => {
      event.type;
    },
  );
  agent1.generation.server.events.on("*", (event) => {
    event.type;
  });
  agent1.generation.server.events.on("messages.create", (event) => {
    event.type;
  });
  // @ts-expect-error
  agent1.generation.server.events.on(["messages.create", "doesn'texist"], (event) => {
    event.type;
  });

  return (
    <div>
      <h1>Example Agent</h1>
      <p>Listening: {status?.listening ? "Yes" : "No"}</p>
      <p>Thinking: {status?.thinking ? "Yes" : "No"}</p>
      <p>Speaking: {status?.speaking ? "Yes" : "No"}</p>
      {/* <button onClick={handleInvite} type="button">
        Invite
      </button>
      <h3>Status</h3>
      {(status && (
        <ul>
          <li>Listening: {status?.listening ? "Yes" : "No"}</li>
          <li>Thinking: {status?.thinking ? "Yes" : "No"}</li>
          <li>Speaking: {status?.speaking ? "Yes" : "No"}</li>
        </ul>
      )) ||
        "Not connected."} */}
    </div>
  );
};
