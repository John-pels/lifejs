// biome-ignore-all lint/performance/noAwaitInLoops: synchronous execution required here

import fs from "node:fs/promises";
import path from "node:path";
import { type Node, type ParseResult, parseAsync } from "oxc-parser";
import { walk } from "oxc-walker";
import resolve from "resolve";
import * as op from "@/shared/operation";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];

const detectLanguage = (f: string) => {
  const ext = path.extname(f).toLowerCase();
  if (ext === ".tsx") return "tsx";
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") return "ts";
  if (ext === ".jsx") return "jsx";
  return "js";
};

const resolveLocalFrom = (spec: string, basedir: string): string | null => {
  try {
    const resolved = resolve.sync(spec, {
      basedir,
      extensions: EXTENSIONS,
      preserveSymlinks: true,
      includeCoreModules: false,
    });
    // Only return paths that are not in node_modules (i.e., local dependencies)
    return resolved.includes("/node_modules/") ? null : resolved;
  } catch {
    return null;
  }
};

const isTypeOnlyImport = (node: Node): boolean => {
  // Handle `import type { ... } from '...'` or `import type * as ... from '...'`
  if (node.type === "ImportDeclaration" && node.importKind === "type") {
    return true;
  }

  // Handle mixed imports like `import { value, type Type } from '...'`
  if (node.type === "ImportDeclaration" && node.specifiers) {
    // If there are no specifiers, it's a side effect import (never type-only)
    if (node.specifiers.length === 0) {
      return false;
    }

    // Check if ALL specifiers are type-only
    const hasValueImports = node.specifiers.some((spec) => {
      // ImportDefaultSpecifier and ImportNamespaceSpecifier don't have importKind
      if (spec.type === "ImportDefaultSpecifier" || spec.type === "ImportNamespaceSpecifier") {
        return true; // These are always value imports
      }
      // ImportSpecifier can have importKind: "type" for individual type imports
      return spec.type === "ImportSpecifier" && spec.importKind !== "type";
    });

    return !hasValueImports;
  }

  return false;
};

/**
 * Return all transitive import dependencies for one or many entry files.
 * Supports TS/TSX/JS/JSX and ESM/CJS. Syntax errors tolerant.
 *
 * @param entries - The absolute entry path(s) to get the dependencies for.
 * @param exclude - Absolute path(s) to exclude from the dependency tree (excludes the file and its entire subtree).
 * @param skipTypeOnlyDependencies - Whether to exclude TypeScript type-only imports (default: false).
 * @returns An array of absolute paths to the dependencies.
 */
export const getDependenciesMap = async (
  entries: string | string[],
  exclude: string | string[] = [],
  skipTypeOnlyDependencies = false,
) => {
  const output = new Set<string>();

  // Ensure entries is an array, of clean absolute paths
  const entriesArray = Array.isArray(entries) ? entries : [entries];
  for (const p of entriesArray) {
    if (!path.isAbsolute(p))
      return op.failure({
        code: "Validation",
        message: `Provided entry path must be absolute: ${p}`,
      });
  }
  const entriesSet = new Set(entriesArray.map((p) => path.resolve(p)));

  // Ensure exclude is an array, of clean absolute paths
  const excludeArray = Array.isArray(exclude) ? exclude : [exclude];
  for (const p of excludeArray) {
    if (p && !path.isAbsolute(p))
      return op.failure({
        code: "Validation",
        message: `Provided exclude path must be absolute: ${p}`,
      });
  }
  const excludeSet = new Set(excludeArray.filter(Boolean).map((p) => path.resolve(p)));

  // Initialize the queue
  const queue = [...entriesSet];

  // Track already visited files
  const visited = new Set<string>();

  // Process the queue
  while (queue.length) {
    const file = queue.pop();
    if (!file) throw new Error("Shouldn't happen");

    // Skip if already visited or excluded
    if (visited.has(file) || excludeSet.has(file)) continue;
    visited.add(file);

    // Read the file content
    let content: string;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    // Parse the file content
    let ast: ParseResult;
    try {
      ast = await parseAsync(file, content, {
        sourceType: "module",
        lang: detectLanguage(file),
      });
    } catch {
      // oxc-parser can rarely panic. In this case, skip this file.
      continue;
    }

    const specifiers = new Set<string>();
    walk(ast.program, {
      enter(node) {
        // import ... from 'x'
        if (node.type === "ImportDeclaration" && node.source?.value) {
          // Skip type-only imports if skipTypeOnlyDependencies is true
          if (skipTypeOnlyDependencies && isTypeOnlyImport(node)) {
            return;
          }
          specifiers.add(node.source.value);
        }
        // export * from 'x' / export { ... } from 'x'
        if (
          (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") &&
          node.source?.value
        ) {
          // Skip type-only exports if skipTypeOnlyDependencies is true
          if (skipTypeOnlyDependencies && node.exportKind === "type") {
            return;
          }
          specifiers.add(node.source.value);
        }
        // import('x')
        if (
          node.type === "ImportExpression" &&
          node.source?.type === "Literal" &&
          typeof node.source.value === "string"
        ) {
          specifiers.add(node.source.value);
        }
        // require('x') / require.resolve('x')
        if (node.type === "CallExpression" && node.arguments?.length === 1) {
          const arg = node.arguments[0];
          const literalArg =
            arg && arg.type === "Literal" && typeof arg.value === "string"
              ? (arg.value as string)
              : null;

          if (literalArg && node.callee.type === "Identifier" && node.callee.name === "require") {
            specifiers.add(literalArg);
          } else if (
            literalArg &&
            node.callee.type === "MemberExpression" &&
            node.callee.object.type === "Identifier" &&
            node.callee.object.name === "require" &&
            node.callee.property.type === "Identifier" &&
            node.callee.property.name === "resolve"
          ) {
            specifiers.add(literalArg);
          }
        }
      },
    });

    const basedir = path.dirname(file);
    for (const spec of specifiers) {
      const resolved = resolveLocalFrom(spec, basedir);
      if (!resolved || excludeSet.has(resolved)) continue;
      if (!entriesSet.has(resolved)) output.add(resolved);
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  return op.success(Array.from(output));
};
