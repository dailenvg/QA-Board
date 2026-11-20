import { readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `permissions.ts` runs in the browser too (client components import it), so
 * everything it imports must: walked here import by import, through Better
 * Auth's access control, it reaches no Node built-in and no package but the
 * few that module needs. A Better Auth upgrade that adds a server import to
 * access control fails here rather than in the browser bundle.
 */

const ENTRY = fileURLToPath(new URL("./permissions.ts", import.meta.url));
const ALLOWED_PACKAGES = new Set(["better-auth", "@better-auth/core", "better-call"]);
const BUILTINS = new Set(builtinModules);

/**
 * The specifiers of a module's value imports, re-exports and requires (a
 * package may resolve to its CommonJS build here); type-only ones are erased.
 */
function importsOf(source: string): string[] {
  const statements = source.matchAll(
    /^\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s*)?["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/gm,
  );
  return [...statements].map((match) => match[1] ?? match[2] ?? "");
}

function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
}

/** Where `specifier`, imported from `file`, is: a sibling `.ts` file or a package's published module. */
function resolveFrom(file: string, specifier: string): string {
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(file), specifier);
    return file.endsWith(".ts") ? `${target.replace(/\.ts$/, "")}.ts` : target;
  }
  return createRequire(file).resolve(specifier);
}

/** Every module reachable from `entry` by value imports, and every package and built-in they name. */
function importGraph(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const builtins = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of importsOf(readFileSync(file, "utf8"))) {
      if (specifier.startsWith("node:") || BUILTINS.has(packageOf(specifier))) {
        builtins.add(specifier);
        continue;
      }
      if (!specifier.startsWith(".")) packages.add(packageOf(specifier));
      pending.push(resolveFrom(file, specifier));
    }
  }
  return { files, packages, builtins };
}

describe("permissions.ts in the browser bundle", () => {
  it("imports no Node built-in and no server package, through Better Auth's access control", () => {
    const { files, packages, builtins } = importGraph(ENTRY);
    expect([...files].some((file) => file.endsWith("access-control.ts"))).toBe(true);
    expect(packages.has("better-auth")).toBe(true);
    expect(builtins).toEqual(new Set());
    expect([...packages].filter((name) => !ALLOWED_PACKAGES.has(name))).toEqual([]);
  });
});
