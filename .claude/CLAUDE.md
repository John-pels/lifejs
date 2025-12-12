# Life.js

## Project

### Introduction
*Life.js is the first open-source framework to build agentic apps, i.e., apps that can adapt to the users, perceive, and even act autonomously alongside them, while being interacted with via voice, text, or touch.*

### Repository Structure
Life.js codebase is a monorepo powered by Turborepo.

Apps:
- `playground/` - A playground/sandbox app for testing and development.
- `website/` - The official website of Life.js hosted at https://lifejs.org.

Packages:
- `life/` - The main package containing the entire Life.js framework.
- `releases/` - A package for managing releases of Life.js.

Here is an overview of `life/` package sub-folders:
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

#### Commands
Here are the package manager commands to execute **at the root** of the monorepo to interact with the project.
- `bun run dev` - Start development servers for all apps.
- `bun run build` - Build all packages and apps
- `bun run types` - Run TypeScript type checking across the entire repository
- `bun run lint` - Run linting with ultracite (extends Biome) across the entire repository
- `bun run format` - Format code with ultracite across the entire repository
- `bun run test` (and not `bun test`) - Run tests across the entire repository

You mainly want to use those root commands instead of calling specific apps/packages commands.

### Stack
- **Package Manager**: We use Bun, so use `bun install` and `bun run` instead of NPM equivalents.
- **Monorepo**: Turborepo.
- **Linting & Formatting**: ultracite (extends Biome), configured in `biome.json`
- **TypeScript**: Version 5.x.x across all packages
- **Testing**: Vitest (ran with `bun run test`) which is automatically picking and running `*.test.ts` files in the project.

### Development Guidelines

#### Thinking
- Use thinking at every step, whenever possible reason about your changes and ideas ( think ).

#### Code Style
- TypeScript for all code, avoid @ts-ignore and `any` whenever possible
- Make sure changes / additions are consistent with the existing code around it
- Be surgical, minimal and precise in your changes
- Never drop any existing feature or behavior because it is incompatible with some changes you performed. If adapting that part is heavy and you're unsure, ask the user, else adapt the now incompatible part.
- Do not workaround or implement a solution partially meeting requirements without asking the user first
- Use interfaces over types whenever possible
- Avoid enums, use const maps
- Prefer functional and declarative patterns
- Use early returns for readability
- Named exports for components
- Descriptive naming with auxiliary verbs (isLoading, hasError)
- Event handlers prefixed with "handle" or "process"

#### Test your changes
Before concluding that a performed change is working, write a minimal temporary test file to test that your changes are working as expected.

#### Answers Tips
- Keep your answer minimal and dense, still easy to read quickly
- Be as transparent as possible with the user, always explain shortly your reasoning
- If unsure, or facing a complex dilemma, stop the conversation and ask the user
- Consider introducing a TL;DR at the top or bottom of complex explanations

## Bun
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`


## Ultracite Code Standards

This project uses **Ultracite**, a zero-config Biome preset that enforces strict code quality standards through automated formatting and linting.

### Quick Reference

- **Format code**: `npx ultracite fix`
- **Check for issues**: `npx ultracite check`
- **Diagnose setup**: `npx ultracite doctor`

Biome (the underlying engine) provides extremely fast Rust-based linting and formatting. Most issues are automatically fixable.

---

### Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

#### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

#### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

#### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

#### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

#### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

#### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

#### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

#### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

#### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

### Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

### When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `npx ultracite fix` before committing to ensure compliance.
