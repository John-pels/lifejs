import { LifeServer } from "life/server";

export interface StartOptions {
  port?: string;
  host?: string;
  config?: string;
}

export const executeStart = (options: StartOptions = {}) => {
  const server = new LifeServer();
  console.log(server.listAvailableAgents());

  console.log("Starting Life.js production server...");
  console.log(`Server: http://${options.host || "0.0.0.0"}:${options.port || "3000"}`);

  // TODO: Implement production server startup
  console.log("\n⚠️  Production server implementation coming soon!");
  console.log("For now, please use 'life dev' for development.");
};
