This is the main package of the monorepo, containing the entire Life.js framework (`npm install life`).

## Overview
- `agent/` — Provides agent definition (`defineAgent()`) and server.
- `transport/` — Abstracts complex WebRTC/streaming logic behind a simple `Transport` class.
- `models/` — Offer a unified API to interact with various LLM/TTS/STT/EOU/VAD providers.
- `config/` — Contains the schema of agents configuration used by global config (`life.config.ts` file) and local configs (defineAgent().config(...))
- `plugins/` — In Life.js everything is a plugin, even the generation. This contains all native plugins.
- `client/` — Provide a client to connect and interact with a Life.js agent.
- `react/` — Exposes React hooks and components built on top of `life/client`.
- `shared/` — Shared utilities and helpers.
- `cli/` — The `life` command-line interface used to run development server, build Life.js project, deploy, etc.
- `storage/` (coming soon) — Offers a unified API for relational and vector database operations.
- `compiler/` (coming soon) — Compiles a Life.js project into a ready-to-run `.life/` folder.


## License
Life.js is MIT-licensed unless you aim to be the “Vercel for Life.js”, which we plan to pioneer to fund Life.js' long-term development. This is a temporary measure to protect early efforts; we'll then transition to a plain MIT license. See [LICENSE](./LICENSE) and [LICENSE.SERVICE](./LICENSE.SERVICES).

If you have any question regarding licensing, mention any of the maintainers [on Discord](https://discord.gg/U5wHjT5Ryj), or write your question at license@lifejs.org.

Much love.