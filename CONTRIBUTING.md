Hey, welcome here! 👋

This document contains everything you need to know to become a Life.js contributor.

### Repository overview

Even Life.js' repository is simple and minimal:
- the entire Life.js library is located at `packages/life`
- the website and documentation are in `apps/website`

That's it. Then, in `packages/life` you'll find sub-folders for each of the main Life.js parts:
- `life/agent`: Runs and manages agents compiled in the `.life/` folder.
- `life/transport`: Abstracts complex WebRTC/streaming logic behind a simple `Transport` class.
- `life/models`: Offers a unified API for interacting with LLM, TTS, STT, and other AI models.
- `life/plugins`: In Life.js everything is a plugin, even the generation. This contains all native plugins.
- `life/client`: Allows interacting with a Life.js client from browser.
- `life/react`: Exposes React hooks and components built on top of `life/client`.
- `life/compiler`: Compiles a Life.js project into a ready-to-run `.life/` folder.
- `life/shared`: Hosts shared utilities, types, and constants used across multiple packages.
- `life/cli`: Comman-line interface to manage a Life.js project.
- `life/storage` (coming soon): Offers a unified API for relational and vector database operations.

### Where should I start?
If you don't know where to get started, look at issues tagged with "[good first issue](https://github.com/lifejs/lifejs/issues?q=is:issue%20state:open%20label:%22good%20first%20issue%22)" on Github those are great entry points to contribute to Life.js.

### Contributions
That's it? You've found the change you want to make to Life.js?

Here is a step by step guide about how to develop that change:
1. Fork the Life.js repository
2. Clone your fork locally with `git clone https://github.com/<your_username>/lifejs.git`
3. Develop and commit on that fork (small atomic commits are easier to review and revert 🙏)
4. Once you're done, use `bun change` to write a changeset to describe your change 
5. Get back to the your fork on Github, and click "Open Pull Request"
6. If relevant, be verbose about your intention, your thought process, and why you ended up there. We'll have to carefully review your change, so ask yourself "What do they need to know to review this PR easily and quickly?".
7. Wait a few hours until a maintainer merge your branch, or ask you follow up changes. 