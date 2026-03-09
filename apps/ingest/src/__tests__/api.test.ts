import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
          "gen_ai.session.id": "sess-a",
          "gen_ai.usage.input_tokens": 900
        },
        category: "agent_session",
        conversationId: "sess-a",
        durationMs: 50,
        inputTokens: 900,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex"
        },
        serviceName: "codex",
        sessionId: "sess-a",
        spanId: "session-a",
        spanName: "turn/start",
        startTimeMs: startTimeMs - 500,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: undefined,
        toolCallId: undefined,
        toolName: undefined,
        traceId: "trace-a"
      },
      {
        attributes: {
          "tool.name": "exec_command"
        },
        category: "tool_call",
        conversationId: "sess-a",
        durationMs: 25,
        inputTokens: undefined,
        kind: "SPAN_KIND_INTERNAL",
        outputTokens: 250,
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
        toolArguments: '{\n  "cmd": "ls"\n}',
        toolCallId: "call-a",
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
    expect(overview.json().summary.spanCount).toBe(2);
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().sessions[0].toolNames).toEqual(["exec_command"]);
  });

  it("returns cors headers for localhost dashboard requests", async () => {
    const origin = "http://127.0.0.1:14319";
    const response = await app.inject({
      headers: {
        origin
      },
      method: "GET",
      url: "/api/overview?range=3600"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers.vary).toContain("Origin");
  });

  it("handles localhost dashboard preflight requests", async () => {
    const origin = "http://127.0.0.1:14319";
    const response = await app.inject({
      headers: {
        "access-control-request-headers": "content-type",
        "access-control-request-method": "GET",
        origin
      },
      method: "OPTIONS",
      url: "/api/overview?range=3600"
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toBe("content-type");
  });

  it("serves agent overview and tool drilldown responses", async () => {
    const overview = await app.inject({
      method: "GET",
      url: "/api/agent/overview?range=3600&bucket=60"
    });
    const tools = await app.inject({
      method: "GET",
      url: "/api/agent/tools?range=3600&limit=5&toolName=exec_command"
    });

    expect(overview.statusCode).toBe(200);
    expect(overview.json().summary).toMatchObject({
      conversationCount: 1,
      inputTokens: 900,
      outputTokens: 250,
      toolCallCount: 1
    });
    expect(overview.json().conversations[0]).toMatchObject({
      conversationId: "sess-a",
      inputTokens: 900,
      outputTokens: 250
    });

    expect(tools.statusCode).toBe(200);
    expect(tools.json().tools[0]).toMatchObject({
      callCount: 1,
      toolName: "exec_command"
    });
    expect(tools.json().selectedTool.calls[0]).toMatchObject({
      arguments: '{\n  "cmd": "ls"\n}',
      conversationId: "sess-a",
      toolCallId: "call-a",
      toolName: "exec_command"
    });
  });
});
