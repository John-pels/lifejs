// import { AgentClient } from "@/agent/client/class";
// import type { GeneratedAgentClient } from "@/agent/client/types";
// import { type ClientBuild, importClientBuild } from "@/exports/build/client";

// export const createAgentClient =
//   <Name extends keyof ClientBuild>(name: Name, args?: { id?: string }) =>
//   async () => {
//     const build = await importClientBuild();
//     if (!build[name]) throw new Error(`Agent client ${name} not found`);
//     return new AgentClient({
//       definition: build[name].definition,
//       plugins: build[name].plugins,
//       id: args?.id,
//     }) as unknown as GeneratedAgentClient<Name>;
//   };

export class LifeClient {}
