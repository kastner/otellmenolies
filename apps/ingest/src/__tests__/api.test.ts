import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerApiRoutes } from "../http/api.js";
import { createSpanStore } from "../storage/span-store.js";
import { createSqliteDatabase } from "../storage/sqlite.js";

describe("api routes", () => {
  let app: ReturnType<typeof Fastify>;
  let tempDir: string;

  beforeEach(() => {
    const startTimeMs = Date.now() - 1_000;

    tempDir = path.join(
      os.tmpdir(),
      `otellmenolies-api-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    const database = createSqliteDatabase(path.join(tempDir, "telemetry.sqlite"));
    const spans = createSpanStore(database);

    spans.insertSpans([
      {
        attributes: {
          "tool.name": "exec_command"
        },
        category: "tool_call",
        durationMs: 25,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex"
        },
        serviceName: "codex",
        sessionId: "sess-a",
        spanId: "tool-a",
        spanName: "tool.exec_command",
        startTimeMs,
        statusCode: "STATUS_CODE_UNSET",
        toolName: "exec_command",
        traceId: "trace-a"
      }
    ]);

    app = Fastify();
    registerApiRoutes(app, { spans });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, {
      force: true,
      recursive: true
    });
  });

  it("serves overview and sessions responses", async () => {
    const overview = await app.inject({
      method: "GET",
      url: "/api/overview?range=3600"
    });
    const sessions = await app.inject({
      method: "GET",
      url: "/api/sessions?range=3600"
    });

    expect(overview.statusCode).toBe(200);
    expect(overview.json().summary.spanCount).toBe(1);
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().sessions[0].toolNames).toEqual(["exec_command"]);
  });
});
