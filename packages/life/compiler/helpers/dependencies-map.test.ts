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
`,

      // File with type-only imports
      "withTypeImports.ts": `
import type { FC } from "react";
import { type ButtonProps, Button } from "./components/Button";
import type * as Types from "./types/common";
import { utilA } from "./utils/utilA";
import "./utils/utilB"; // side effect import

export type ComponentType = FC<ButtonProps>;
export const MyComponent: ComponentType = () => utilA();
`,

      // Type definitions file
      "types/common.ts": `
export interface CommonInterface {
  id: string;
  name: string;
}

export type Status = "pending" | "complete";
`,

      // Component with mixed imports
      "components/Button.ts": `
import type { ReactNode } from "react";
import { sharedFunction } from "../shared/shared";

export interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
}

export const Button = (props: ButtonProps) => {
  sharedFunction();
  return props;
};
`,

      // File with type-only exports
      "typeExports.ts": `
export type { CommonInterface } from "./types/common";
export type { ButtonProps } from "./components/Button";
export { utilA } from "./utils/utilA"; // value export
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

  it("should exclude a single file and its dependencies", async () => {
    const entryPoint = testFiles["index.ts"] as string;
    const excludeFile = testFiles["utils/utilA.ts"] as string;

    // First get dependencies without exclude
    const resultWithoutExclude = await getDependenciesMap(entryPoint);
    expect(resultWithoutExclude[0]).toBeUndefined();
    const depsWithoutExclude = resultWithoutExclude[1] as string[];

    // Then get dependencies with exclude
    const resultWithExclude = await getDependenciesMap(entryPoint, excludeFile);
    expect(resultWithExclude[0]).toBeUndefined();
    const depsWithExclude = resultWithExclude[1] as string[];

    const depsWithoutExcludeNames = depsWithoutExclude.map(dep => path.relative(tempDir, dep));
    const depsWithExcludeNames = depsWithExclude.map(dep => path.relative(tempDir, dep));

    // The excluded file should not be in the result
    expect(depsWithExcludeNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(false);
    expect(depsWithoutExcludeNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);

    // Dependencies that utilA imports should also be excluded from the subtree
    // But they might still be included if imported by other files
    expect(depsWithExclude.length).toBeLessThan(depsWithoutExclude.length);
  });

  it("should exclude multiple files", async () => {
    const entryPoint = testFiles["index.ts"] as string;
    const excludeFiles = [
      testFiles["utils/utilA.ts"] as string,
      testFiles["helpers/helperB.ts"] as string
    ];

    const resultWithExclude = await getDependenciesMap(entryPoint, excludeFiles);
    expect(resultWithExclude[0]).toBeUndefined();
    const dependencies = resultWithExclude[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    // Both excluded files should not be in the result
    expect(dependencyNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(false);
    expect(dependencyNames.some(name => name.endsWith("helpers/helperB.ts"))).toBe(false);

    // But other files should still be included
    expect(dependencyNames.some(name => name.endsWith("utils/defaultExport.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("helpers/index.ts"))).toBe(true);
  });

  it("should exclude file that breaks dependency chain", async () => {
    const entryPoint = testFiles["utils/utilA.ts"] as string;
    const excludeFile = testFiles["shared/shared.ts"] as string;

    // Without exclude, should include shared/shared.ts and shared/base.ts
    const resultWithoutExclude = await getDependenciesMap(entryPoint);
    expect(resultWithoutExclude[0]).toBeUndefined();
    const depsWithoutExclude = resultWithoutExclude[1] as string[];
    const depsWithoutExcludeNames = depsWithoutExclude.map(dep => path.relative(tempDir, dep));

    // With exclude, should not include shared/shared.ts
    const resultWithExclude = await getDependenciesMap(entryPoint, excludeFile);
    expect(resultWithExclude[0]).toBeUndefined();
    const depsWithExclude = resultWithExclude[1] as string[];
    const depsWithExcludeNames = depsWithExclude.map(dep => path.relative(tempDir, dep));

    // Verify the excluded file is not included
    expect(depsWithoutExcludeNames.some(name => name.endsWith("shared/shared.ts"))).toBe(true);
    expect(depsWithExcludeNames.some(name => name.endsWith("shared/shared.ts"))).toBe(false);

    // shared/base.ts might still be included through utilB -> shared/deep -> shared/base chain
    // But utilB should still be included since it's a side effect import
    expect(depsWithExcludeNames.some(name => name.endsWith("utils/utilB.ts"))).toBe(true);
    expect(depsWithExcludeNames.some(name => name.endsWith("shared/deep.ts"))).toBe(true);

    // The result should have fewer dependencies
    expect(depsWithExclude.length).toBeLessThan(depsWithoutExclude.length);
  });

  it("should return failure for non-absolute exclude paths", async () => {
    const entryPoint = testFiles["index.ts"] as string;
    const relativeExcludePath = "relative/exclude.ts";

    const result = await getDependenciesMap(entryPoint, relativeExcludePath);

    // Should return operation failure
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBeDefined(); // error should be present
    expect(result[0]?.code).toBe("Validation");
    expect(result[0]?.message).toContain("absolute");
    expect(result[0]?.message).toContain("exclude");
  });

  it("should handle exclude with empty array", async () => {
    const entryPoint = testFiles["index.ts"] as string;

    const resultWithEmptyExclude = await getDependenciesMap(entryPoint, []);
    const resultWithoutExclude = await getDependenciesMap(entryPoint);

    expect(resultWithEmptyExclude[0]).toBeUndefined();
    expect(resultWithoutExclude[0]).toBeUndefined();

    const depsWithEmptyExclude = resultWithEmptyExclude[1] as string[];
    const depsWithoutExclude = resultWithoutExclude[1] as string[];

    // Results should be identical
    expect(depsWithEmptyExclude.sort()).toEqual(depsWithoutExclude.sort());
  });

  it("should handle exclude with non-existent file", async () => {
    const entryPoint = testFiles["index.ts"] as string;
    const nonExistentExclude = path.join(tempDir, "nonexistent-exclude.ts");

    const result = await getDependenciesMap(entryPoint, nonExistentExclude);
    expect(result[0]).toBeUndefined(); // should not error

    const dependencies = result[1] as string[];

    // Should work normally since the non-existent file doesn't affect anything
    expect(dependencies.length).toBeGreaterThan(0);
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));
    expect(dependencyNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);
  });

  it("should exclude type-only imports when skipTypeOnlyDependencies is true", async () => {
    const entryPoint = testFiles["withTypeImports.ts"] as string;

    // Without skipping type-only imports
    const resultWithTypes = await getDependenciesMap(entryPoint, [], false);
    expect(resultWithTypes[0]).toBeUndefined();
    const depsWithTypes = resultWithTypes[1] as string[];
    const depsWithTypesNames = depsWithTypes.map(dep => path.relative(tempDir, dep));

    // With skipping type-only imports
    const resultWithoutTypes = await getDependenciesMap(entryPoint, [], true);
    expect(resultWithoutTypes[0]).toBeUndefined();
    const depsWithoutTypes = resultWithoutTypes[1] as string[];
    const depsWithoutTypesNames = depsWithoutTypes.map(dep => path.relative(tempDir, dep));

    // Should include value imports
    expect(depsWithoutTypesNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);
    expect(depsWithoutTypesNames.some(name => name.endsWith("utils/utilB.ts"))).toBe(true);
    expect(depsWithoutTypesNames.some(name => name.endsWith("components/Button.ts"))).toBe(true);

    // Should NOT include type-only imports when skipTypeOnlyDependencies is true
    expect(depsWithoutTypesNames.some(name => name.endsWith("types/common.ts"))).toBe(false);

    // Should have fewer dependencies when excluding type-only imports
    expect(depsWithoutTypes.length).toBeLessThanOrEqual(depsWithTypes.length);
  });

  it("should exclude type-only exports when skipTypeOnlyDependencies is true", async () => {
    const entryPoint = testFiles["typeExports.ts"] as string;

    // Without skipping type-only imports
    const resultWithTypes = await getDependenciesMap(entryPoint, [], false);
    expect(resultWithTypes[0]).toBeUndefined();
    const depsWithTypes = resultWithTypes[1] as string[];
    const depsWithTypesNames = depsWithTypes.map(dep => path.relative(tempDir, dep));

    // With skipping type-only imports
    const resultWithoutTypes = await getDependenciesMap(entryPoint, [], true);
    expect(resultWithoutTypes[0]).toBeUndefined();
    const depsWithoutTypes = resultWithoutTypes[1] as string[];
    const depsWithoutTypesNames = depsWithoutTypes.map(dep => path.relative(tempDir, dep));

    // Should include value exports
    expect(depsWithoutTypesNames.some(name => name.endsWith("utils/utilA.ts"))).toBe(true);

    // Should NOT include type-only exports when skipTypeOnlyDependencies is true
    expect(depsWithoutTypesNames.some(name => name.endsWith("types/common.ts"))).toBe(false);
    expect(depsWithoutTypesNames.some(name => name.endsWith("components/Button.ts"))).toBe(false);

    // Should have fewer dependencies when excluding type-only imports
    expect(depsWithoutTypes.length).toBeLessThan(depsWithTypes.length);
  });

  it("should handle mixed imports correctly with skipTypeOnlyDependencies", async () => {
    const entryPoint = testFiles["components/Button.ts"] as string;

    // With skipping type-only imports
    const result = await getDependenciesMap(entryPoint, [], true);
    expect(result[0]).toBeUndefined();
    const dependencies = result[1] as string[];
    const dependencyNames = dependencies.map(dep => path.relative(tempDir, dep));

    // Should include value imports (sharedFunction is a value import)
    expect(dependencyNames.some(name => name.endsWith("shared/shared.ts"))).toBe(true);
    expect(dependencyNames.some(name => name.endsWith("shared/base.ts"))).toBe(true);

    // Should NOT include react (type-only import)
    // React imports would fail to resolve anyway since it's external
  });

  it("should work normally when skipTypeOnlyDependencies is false", async () => {
    const entryPoint = testFiles["withTypeImports.ts"] as string;

    const resultDefault = await getDependenciesMap(entryPoint);
    const resultExplicitFalse = await getDependenciesMap(entryPoint, [], false);

    expect(resultDefault[0]).toBeUndefined();
    expect(resultExplicitFalse[0]).toBeUndefined();

    const depsDefault = resultDefault[1] as string[];
    const depsExplicitFalse = resultExplicitFalse[1] as string[];

    // Results should be identical
    expect(depsDefault.sort()).toEqual(depsExplicitFalse.sort());
  });
});