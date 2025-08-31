# life

## 0.11.1

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [05bf447](https://github.com/lifejs/lifejs/commit/05bf4479da105d919c73014aa248469eaeb2adf2) — Typescript Intellisense was becoming quite slow when defining agents, plugins, etc. p90 latency is back to <150 ms.

## 0.11.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [88aa90e](https://github.com/lifejs/lifejs/commit/88aa90edf139cdfbceaaebaad25eecb9d8f2dbea) — The plugin.context() API has been improved with initial values
- [@LilaRest](https://github.com/LilaRest) in [88aa90e](https://github.com/lifejs/lifejs/commit/88aa90edf139cdfbceaaebaad25eecb9d8f2dbea) — The plugin.methods() API has been replaced by plugin.api() making it more flexible and runtime agnostic
- [@LilaRest](https://github.com/LilaRest) in [6c96aa3](https://github.com/lifejs/lifejs/commit/6c96aa3571e209da506bf06e377fef733b9024fb) — New defineStore() definition builder

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [61437de](https://github.com/lifejs/lifejs/commit/61437de528787a59e9be66a1b224c355b14abcb4) — Exclude memories builder methods as they are called

## 0.10.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [e05db22](https://github.com/lifejs/lifejs/commit/e05db22eaf76f4617ed4fd389ee99913b26f117c) — Add an higher-level and typesafe RPC API to Transport classes
- [@LilaRest](https://github.com/LilaRest) in [100a020](https://github.com/lifejs/lifejs/commit/100a020e9aa488e80f678c0a1e1d41e6989f1573) — New client-side config schema and types
- [@LilaRest](https://github.com/LilaRest) in [9f72c47](https://github.com/lifejs/lifejs/commit/9f72c47df15197d2331062a7e82b635af62b2fae) — First functional version of client
- [@LilaRest](https://github.com/LilaRest) in [a31a8b4](https://github.com/lifejs/lifejs/commit/a31a8b4a00edb76259c2c9a2efe15d403d172146) — Add support for ZodError serialization

## 0.9.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [180bd76](https://github.com/lifejs/lifejs/commit/180bd76dd5450abe347f31e3c6844074e783961e) — Simplify the plugin context API to enforce immutability without neither relying on complex JS Proxy patterns, nor on the consumers to properly clone values

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [2922863](https://github.com/lifejs/lifejs/commit/29228635e7c74723e023e902310dd6da1c9008d3) — Plugin.methods() was still be typed with the raw context
- [@LilaRest](https://github.com/LilaRest) in [180bd76](https://github.com/lifejs/lifejs/commit/180bd76dd5450abe347f31e3c6844074e783961e) — Make non-blocking memories running on history change, instead of resources requests
- [@LilaRest](https://github.com/LilaRest) in [4685488](https://github.com/lifejs/lifejs/commit/468548843e8b76625199a5d3bd9d0974a45fe939) — Fix plugin.pick() broken typesafety

## 0.8.1

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [ca414d2](https://github.com/lifejs/lifejs/commit/ca414d2d81e341bb173a9fc28523abd36fcb3bce) — Cleanup bundle and package.json metadata
- [@LilaRest](https://github.com/LilaRest) in [c8afe26](https://github.com/lifejs/lifejs/commit/c8afe263a4c558364017daa73b6d6a318eea7e17) — Make peer dependencies optional

## 0.8.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [0672921](https://github.com/lifejs/lifejs/commit/06729210cc09f05447bb7491019aee5b993f810a) — Wire plugin lifecycle hooks in the plugin runner
- [@LilaRest](https://github.com/LilaRest) in [1689ef2](https://github.com/lifejs/lifejs/commit/1689ef2cd69c545104cbcedd253363fd32d83c80) — Add set() method to plugin context and onChange() listeners

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [01e5ff9](https://github.com/lifejs/lifejs/commit/01e5ff9474feafba02fc4783494343db9df33630) — Solve context.onChange() not properly comparing object values
- [@LilaRest](https://github.com/LilaRest) in [01e5ff9](https://github.com/lifejs/lifejs/commit/01e5ff9474feafba02fc4783494343db9df33630) — Refactor and simplify: equal, serialize, and sha256 libraries for consistency
- [@LilaRest](https://github.com/LilaRest) in [5542020](https://github.com/lifejs/lifejs/commit/55420203782b39d59e012d81bbd98c7a12bff9a0) — Rename memory.getOutput() to memory.output()
- [@LilaRest](https://github.com/LilaRest) in [a1b3964](https://github.com/lifejs/lifejs/commit/a1b3964b46b9e80361699b99887474dbc24d9b14) — TTS estimated transcript's tokenizer was broken because of regex hoisting

## 0.7.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [766b7a2](https://github.com/lifejs/lifejs/commit/766b7a2945b29033270597d22785b9e756071147) — Add a standardized serialization/deserialization library
- [@LilaRest](https://github.com/LilaRest) in [4ccda6f](https://github.com/lifejs/lifejs/commit/4ccda6f88a4211f3bda85aac6f3653232a666b11) — Refactor plugin dependencies to unify them with the future items dependency and simplify the DX
- [@LilaRest](https://github.com/LilaRest) in [55ed17e](https://github.com/lifejs/lifejs/commit/55ed17e236f54c6285bf062b5a188efa6ed43b63) — Make plugins' context definition bound to a Zod schema

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [55ed17e](https://github.com/lifejs/lifejs/commit/55ed17e236f54c6285bf062b5a188efa6ed43b63) — Bump dependencies + migrate to Biome v2

## 0.6.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [8a45f00](https://github.com/lifejs/lifejs/commit/8a45f00893d9c67ad4f89707e0bc061881a0cadb) — Fully functional memories plugin
- [@LilaRest](https://github.com/LilaRest) in [68f67dc](https://github.com/lifejs/lifejs/commit/68f67dc6c2bbab1ca85f490ac65e7d3ff2fed269) — Wire plugins interceptors to the event loop of the external dependency
- [@LilaRest](https://github.com/LilaRest) in [89fc2d1](https://github.com/lifejs/lifejs/commit/89fc2d14ebd925bf7957135630a53f0bcc7645ba) — New life/define export
- [@LilaRest](https://github.com/LilaRest) in [113c9fc](https://github.com/lifejs/lifejs/commit/113c9fce224c062bbbdcb4c90879a3a72a4b426d) — Huge refactoring/refinement of plugins' dependencies and methods + draft memories plugin

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [ab75a12](https://github.com/lifejs/lifejs/commit/ab75a12c81a0fc55751cadac990f4200e487757f) — Fix plugin methods in agent definition not assigning plugin methods after called

## 0.5.1

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [ed9ef4e](https://github.com/lifejs/lifejs/commit/ed9ef4e2a1a71bb39a54a6bc6d49467f42a220bd) — Fix tools calls formatting in Mistral LLM provider class
- [@LilaRest](https://github.com/LilaRest) in [ed9ef4e](https://github.com/lifejs/lifejs/commit/ed9ef4e2a1a71bb39a54a6bc6d49467f42a220bd) — A lot of simplification on the orchestration/generation classes of the core plugin
- [@LilaRest](https://github.com/LilaRest) in [0bfdca7](https://github.com/lifejs/lifejs/commit/0bfdca7744d31fbba780e67708504639bdad47d4) — Fix new Int16Array type error
- [@LilaRest](https://github.com/LilaRest) in [ed9ef4e](https://github.com/lifejs/lifejs/commit/ed9ef4e2a1a71bb39a54a6bc6d49467f42a220bd) — Mistral LLM provider class wasn't emitting end token

## 0.5.0

### Minor Changes

- [@Cheelax](https://github.com/Cheelax) **(New contributor! 🎉)**, [@LilaRest](https://github.com/LilaRest) in [#65](https://github.com/lifejs/lifejs/pull/65) — Support Mistral.ai LLM provider
- [@LilaRest](https://github.com/LilaRest) in [1c22c1c](https://github.com/lifejs/lifejs/commit/1c22c1ce90c48f765938f78675be01715c1651db) — Add all models and available languages to Cartesia TTS config schema

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [a44c42d](https://github.com/lifejs/lifejs/commit/a44c42da884d662f004eabc146d906683c6e5731) — Generation interruptions weren't working in the case the generation had ended, but it's produced content was still being played. This commit fixes that.
- [@LilaRest](https://github.com/LilaRest) in [4d397bd](https://github.com/lifejs/lifejs/commit/4d397bdec16b38a5fb47be8a9f8b15a30cea4508) — Disable output stream throttling in text-only mode

## 0.4.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [1e6a64a](https://github.com/lifejs/lifejs/commit/1e6a64a0781c3738231e4719504a2758dc5e9ab1) — Re-introduce proper buffer flushing in the Livekit provider
- [@LilaRest](https://github.com/LilaRest) in [90e523c](https://github.com/lifejs/lifejs/commit/90e523c74bbafa595056008994c99e1300fc4656) — Make voice output optional and configurable during conversation

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [4b2dc70](https://github.com/lifejs/lifejs/commit/4b2dc70ff627617a842744697f88303260f3b365) — Replace history message IDs by prefixed short IDs
- [@LilaRest](https://github.com/LilaRest) in [90e523c](https://github.com/lifejs/lifejs/commit/90e523c74bbafa595056008994c99e1300fc4656) — Prevent further history writing after interruption
- [@LilaRest](https://github.com/LilaRest) in [e938b3d](https://github.com/lifejs/lifejs/commit/e938b3d02fe75527e7d2344a3fe99deed78bd75f) — Avoid agent.interrupted event being sent when a generation hasn't sent any output token yet
- [@LilaRest](https://github.com/LilaRest) in [90e523c](https://github.com/lifejs/lifejs/commit/90e523c74bbafa595056008994c99e1300fc4656) — Tools were blocked by TTS pipeline when no content chunk was emitted
- [@LilaRest](https://github.com/LilaRest) in [2ca40eb](https://github.com/lifejs/lifejs/commit/2ca40ebcebbe5883ba02a0844ded5d394486318f) — Fix pace contamination in base TTS class sometimes leading to doublons or missing parts in transcripts

## 0.3.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [eab7741](https://github.com/lifejs/lifejs/commit/eab77416a4784e788f2812aba2a0d61b69448dd2) — The 'core' plugin is now fully functional, and way simpler.

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [4910db1](https://github.com/lifejs/lifejs/commit/4910db1e15f8ddd9e49c00f0df9939b873e7f77e) — Give a default value to TTS pace weighed average, so if the conversation begins before the TTS calibration generation, the text chunks estimations are still almost accurate.
- [@LilaRest](https://github.com/LilaRest) in [0c50ed4](https://github.com/lifejs/lifejs/commit/0c50ed4121d777090522bc6b0f7ccb6914d13f52) — Solve TTS provider output 'end' token with a 1-3 delay + simplify Cartesia provider
- [@LilaRest](https://github.com/LilaRest) in [d654387](https://github.com/lifejs/lifejs/commit/d6543871f074109de3fa5866b5acc3c3a6f9515c) — Interruption handling in generation orchestrator wasn't properly forwarding author key

## 0.2.0

### Minor Changes

- [@DavidIfebueme](https://github.com/DavidIfebueme) **(New contributor! 🎉)**, [@LilaRest](https://github.com/LilaRest) in [#55](https://github.com/lifejs/lifejs/pull/55) — Add support for X.ai LLM provider

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) in [2129f4a](https://github.com/lifejs/lifejs/commit/2129f4ae9803292d848ef98141b53f817da0c603) — add min/max temparature to OpenAI provider's config schema

## 0.1.1

### Patch Changes

- [@LilaRest](https://github.com/LilaRest) **(New contributor! 🎉)** in [48932e0](https://github.com/lifejs/lifejs/commit/48932e00719b653b5901f6ac9528871eec95cecd) — A dummy change to test changelog formatting

## 0.1.0

### Minor Changes

- [@LilaRest](https://github.com/LilaRest) in [d9f876a](https://github.com/lifejs/lifejs/commit/d9f876ade9bab676c5764534d4852089b421195f) — We needed to start somewhere, and we started here 🌱
