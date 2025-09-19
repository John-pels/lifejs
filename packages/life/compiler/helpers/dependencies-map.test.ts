import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getDependenciesMap } from "./dependencies-map";

describe("getDependenciesMap", () => {
  let tempDir: string;
  let testFiles: Record<string, string> = {};

  beforeAll(async () => {
    // Create a temporary directory for our test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "deps-map-test-"));

    // Define test file structure with various import patterns
    const files = {
      // Entry point
      "index.ts": `
import { utilA } from "./utils/utilA";
import { helperB } from "./helpers/helperB";
import defaultExport from "./utils/defaultExport";
import * as allHelpers from "./helpers";
export { utilA, helperB };
`,

      // Utils folder
      "utils/utilA.ts": `
import { sharedFunction } from "../shared/shared";
import "./utilB"; // Side effect import
export const utilA = () => sharedFunction();
`,

      "utils/utilB.ts": `
const { deepFunction } = require("../shared/deep");
module.exports = { utilB: () => deepFunction() };
`,

      "utils/defaultExport.ts": `
import dynamicModule from "../dynamic";
export default function() {
  return import("../lazy/lazyModule");
}
`,

      "utils/index.ts": `
export * from "./utilA";
export { default as defaultExport } from "./defaultExport";
`,

      // Helpers folder
      "helpers/helperB.ts": `
import { sharedFunction } from "../shared/shared";
export const helperB = () => sharedFunction();
`,

      "helpers/index.ts": `
export * from "./helperB";
`,

      // Shared folder
      "shared/shared.ts": `
import { baseFunction } from "./base";
export const sharedFunction = () => baseFunction();
`,

      "shared/base.ts": `
export const baseFunction = () => "base";
`,

      "shared/deep.ts": `
const base = require("./base");
exports.deepFunction = () => base.baseFunction();
`,

      // Dynamic and lazy modules
      "dynamic.ts": `
export default { name: "dynamic" };
`,

      "lazy/lazyModule.ts": `
export const lazyFunction = () => "lazy";
`,

      // JSON file for testing
      "config.json": `
{
  "name": "test-config"
}
`,

      // File with JSON import
      "withJson.ts": `
import config from "./config.json";
export const getConfig = () => config;
`,

      // Complex patterns
      "complex.tsx": `
import React from "react";
import { useState } from "react";
import type { FC } from "react";

const Component: FC = () => {
  const [state] = useState(0);
  return React.createElement("div", null, state);
};

export default Component;
`,

      // CJS style
      "cjs.cjs": `
const path = require("path");
const { utilA } = require("./utils/utilA");

module.exports = {
  processPath: (p) => path.resolve(p),
  useUtil: () => utilA()
};
`,

      // File with require.resolve
      "resolver.js": `
const modulePath = require.resolve("./utils/utilA");
const dynamicPath = require.resolve("./dynamic");
export { modulePath, dynamicPath };
`,

      // Circular dependency test
      "circular/a.ts": `
import { funcB } from "./b";
export const funcA = () => funcB();
`,

      "circular/b.ts": `
import { funcA } from "./a";
export const funcB = () => "b";
`,

      // File with external imports that should be ignored
      "withExternals.ts": `
import crypto from "node:crypto";
import { z } from "zod";
import fs from "fs";
import path from "@/utils/path"; // path mapping style
import { localUtil } from "./utils/utilA";

export const useExternals = () => {
  return crypto.randomUUID() + localUtil();
};
`
    };

    // Create all test files
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, filePath);
      const dir = path.dirname(fullPath);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content);
      testFiles[filePath] = fullPath;
    }
  });

  afterAll(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return dependencies for a simple entry point", async () => {
    const entryPoint = testFiles["index.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    // Should be a successful operation result
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBeUndefined(); // no error
    expect(result[1]).toBeDefined(); // has data

    const dependencies = result[1] as string[];

    // Should include all transitive dependencies
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    expect(dependencyNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("helpers/helperB.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("utils/defaultExport.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("helpers/index.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("shared/shared.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("shared/base.ts"))).toBe(true);

    // Should not include the entry point itself
    expect(dependencyNames.some(name => name === "index.ts")).toBe(false);
  });

  it("should handle multiple entry points", async () => {
    const entryPoints = [testFiles["index.ts"], testFiles["withJson.ts"]].filter(Boolean) as string[];
    const result = await getDependenciesMap(entryPoints);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    // Should include dependencies from both entry points
    expect(dependencyNames.some(name => name.endsWith("config.json"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);

    // Should not include entry points themselves
    expect(dependencyNames.some(name => name === "index.ts")).toBe(false);
    expect(dependencyNames.some(name => name === "withJson.ts")).toBe(false);
  });

  it("should handle CommonJS require patterns", async () => {
    const entryPoint = testFiles["utils/utilB.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    expect(dependencyNames.some(name => name.endsWith("shared/deep.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("shared/base.ts"))).toBe(true);
  });

  it("should handle dynamic imports", async () => {
    const entryPoint = testFiles["utils/defaultExport.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    expect(dependencyNames.some(name => name.endsWith("dynamic.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("lazy/lazyModule.ts"))).toBe(true);
  });

  it("should handle require.resolve calls", async () => {
    const entryPoint = testFiles["resolver.js"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    expect(dependencyNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("dynamic.ts"))).toBe(true);
  });

  it("should handle TypeScript and JSX files", async () => {
    const entryPoint = testFiles["complex.tsx"] as string;
    const result = await getDependenciesMap(entryPoint);

    // TSX file should be parsed correctly even though React imports won't resolve
    expect(result[0]).toBeUndefined(); // no error
    expect(Array.isArray(result[1])).toBe(true);
  });

  it("should handle export re-exports", async () => {
    const entryPoint = testFiles["helpers/index.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    expect(dependencyNames.some(name => name.endsWith("helpers/helperB.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("shared/shared.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("shared/base.ts"))).toBe(true);
  });

  it("should handle circular dependencies without infinite loops", async () => {
    const entryPoint = testFiles["circular/a.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    // Should include both files in the circular dependency
    expect(dependencyNames.some(name => name.endsWith("circular/b.ts"))).toBe(true);

    // Should not hang or crash
    expect(dependencies.length).toBeGreaterThanOrEqual(1);
  });

  it("should return failure for non-absolute paths", async () => {
    const result = await getDependenciesMap("relative/path.ts");

    // Should return operation failure
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBeDefined(); // error should be present
    expect(result[0]?.code).toBe("Validation");
    expect(result[0]?.message).toContain("absolute");
  });

  it("should handle missing files gracefully", async () => {
    const nonExistentPath = path.join(tempDir, "nonexistent.ts");
    const result = await getDependenciesMap(nonExistentPath);

    // Should return empty array for non-existent files
    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    expect(Array.isArray(dependencies)).toBe(true);
    expect(dependencies).toHaveLength(0);
  });

  it("should handle JSON imports", async () => {
    const entryPoint = testFiles["withJson.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    expect(dependencyNames.some(name => name.endsWith("config.json"))).toBe(true);
  });

  it("should deduplicate dependencies", async () => {
    const entryPoint = testFiles["index.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];

    // shared/base.ts should appear only once even though it's imported by multiple files
    const baseDeps = dependencies.filter(dep => dep.endsWith("shared/base.ts"));
    expect(baseDeps).toHaveLength(1);
  });

  it("should exclude external packages and only include local dependencies", async () => {
    const entryPoint = testFiles["withExternals.ts"] as string;
    const result = await getDependenciesMap(entryPoint);

    expect(result[0]).toBeUndefined(); // no error
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));


    // Should include local dependencies
    expect(dependencyNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);

    // Should NOT include external packages (node:crypto, zod, fs)
    // These would fail to resolve or resolve to node_modules, so they shouldn't appear
    expect(dependencyNames.some(name => name.includes("node_modules"))).toBe(false);
    expect(dependencyNames.some(name => name.includes("crypto"))).toBe(false);
    expect(dependencyNames.some(name => name.includes("zod"))).toBe(false);

    // Should include transitive local dependencies from the local import
    expect(dependencyNames.some(name => name.endsWith("shared/shared.ts"))).toBe(true);
  });
});