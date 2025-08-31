import servers from "life/exports/build-server";

export class LifeServer {
  listAvailableAgents() {
    return Object.keys(servers);
    // return Object.values(servers).map((server) => server.definition.name);
  }
}
