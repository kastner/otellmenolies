import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

async function readJson<T>(relativePath: string): Promise<T> {
  const filePath = path.resolve(import.meta.dirname, "../../../..", relativePath);
  const contents = await readFile(filePath, "utf8");

  return JSON.parse(contents) as T;
}

describe("workspace runtime config", () => {
  test("keeps shared imports source-first for bun", async () => {
    const packageJson = await readJson<{
      exports: { ".": { default: string; types: string } };
    }>("packages/shared/package.json");

    expect(packageJson.exports["."].default).toBe("./src/index.ts");
    expect(packageJson.exports["."].types).toBe("./src/index.ts");
  });

  test("runs ingest directly with bun without a dist build step", async () => {
    const packageJson = await readJson<{
      scripts: { build: string; dev: string };
    }>("apps/ingest/package.json");

    expect(packageJson.scripts.dev).toBe("bun --watch src/index.ts");
    expect(packageJson.scripts.build).toBe("bun run lint");
  });

  test("does not force tests to build dependent packages first", async () => {
    const turboJson = await readJson<{
      tasks: { test: { dependsOn?: string[] } };
    }>("turbo.json");

    expect(turboJson.tasks.test.dependsOn ?? []).toEqual([]);
  });
});
