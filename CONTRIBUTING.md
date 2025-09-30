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


### Guidelines

#### `operation` library (a.k.a, `op`)

In order to enforce strong error and return type management across the codebase, we expose the `@/shared/operation` library, often imported as `"op"` (`import * as op from "@/shared/operation"`).

This library expose a few helper functions to `attempt()` an unsafe operation and catch any unhandled in it, or just return a `success()` or `failure()` indicator.

All functions and methods of the codebase must:
1. return `op.success(data?)` or `op.failure()` (even if they return void)
```ts
import * as op from "@/shared/operation"
function myFunc() {
    // void equivalent, but explicitly indicates success
    return op.success() 
    // (or) can return any data alongside success
    return op.success("hello world") 
    // (or) indicate failure (with a LifeError instance or definition)
    return op.failure({ code: "Validation", message: "" }) 
}
```
2. catch any unhandled error in their block using this pattern:
```ts
function myFunc() {
    try {
        // ...
    }
    catch (error) {
        return op.failure({ code: "Unknown", error });
    }
}
```
3. handle or forward any `OperationResult` error returned by other functions
```ts
function myFunc() {
    const [err, data] = myOtherFunction();
    // gracefully handle some errors
    if (err?.code === "NotFound") return op.success([])
    // or forward the error
    else if (err) return op.failure(err);
    // or return the data
    return op.success(data);
}
```
4. Classes' constructor functions should throw any error, and `op.attempt()` should be used during instantiation
```ts
class MyClass {
    constructor () {
        // Possibly unsafe operation that could throw
        anotherLibrary.func();

        // Safe function, throw on error
        const [err, data] = this.add(1,2);
        if (err) throw err;
    }

    add(a: number, b: number) {
        if (a > 10) return op.failure({ code: "Validation", message: "Number must be <= 10"})
        return op.success(a + b);
    }
}
```
And when instantiating:
```ts
const [err, ins] = op.attempt(() => new MyClass())
```

### Logging

Precise logging hints is mandatory for quick debugging (and even more with AI-assisted coding).

The current guidelines about logging are:
1. Use 'info' logs for summaries, anything that allow the developer to ensure the system is
healthy, e.g., "Agent started successfully."
2. Use 'warn' for anything that might be unexpected and should be brought to the developer's
attention without necessarily being an issue.
3. Use 'debug' logs for dynamic results that have a pivotal impact in the program's behaviors, 
e.g., "Identified project path: ./project/"
4. Do not use 'error', prefer forwarding errors using the `operation` library. Those will the be
logged if unhandled at the end of the execution chain, e.g. LifeClient, LifeServer, PluginServer, etc.
