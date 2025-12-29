import type { StoreDefinition } from "../types";
import type { AgentServer } from "./agent";

export class StoreServer {
  readonly #agent: AgentServer;
  readonly #definition: StoreDefinition;

  constructor(agent: AgentServer, definition: StoreDefinition) {
    this.#agent = agent;
    this.#definition = definition;
  }

  get() {}

  set() {}

  #initClientRPC() {}
}
