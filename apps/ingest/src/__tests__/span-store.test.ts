import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSpanStore } from "../storage/span-store.js";
import { createSqliteDatabase } from "../storage/sqlite.js";

describe("span store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `otellmenolies-span-store-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, {
      force: true,
      recursive: true
    });
  });

  it("aggregates overview data for service, graphql, db, and service-call spans", () => {
    const database = createSqliteDatabase(path.join(tempDir, "telemetry.sqlite"));
    const store = createSpanStore(database);

    store.insertSpans([
      {
        attributes: {
          "graphql.operation.name": "GetCatalog"
        },
        category: "graphql",
        durationMs: 42,
        kind: "SPAN_KIND_SERVER",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "gateway"
        },
        serviceName: "gateway",
        sessionId: undefined,
        spanId: "span-gql",
        spanName: "POST /graphql",
        startTimeMs: 1_000,
        statusCode: "STATUS_CODE_UNSET",
        toolName: undefined,
        traceId: "trace-1"
      },
      {
        attributes: {
          "db.system": "postgresql",
          "db.statement": "select * from widgets"
        },
        category: "db",
        durationMs: 11,
        kind: "SPAN_KIND_CLIENT",
        parentSpanId: "span-gql",
        resourceAttributes: {
          "service.name": "gateway"
        },
        serviceName: "gateway",
        sessionId: undefined,
        spanId: "span-db",
        spanName: "SELECT widgets",
        startTimeMs: 1_020,
        statusCode: "STATUS_CODE_UNSET",
        toolName: undefined,
        traceId: "trace-1"
      },
      {
        attributes: {
          "http.method": "POST",
          "server.address": "billing"
        },
        category: "service_call",
        durationMs: 17,
        kind: "SPAN_KIND_CLIENT",
        parentSpanId: "span-gql",
        resourceAttributes: {
          "service.name": "gateway"
        },
        serviceName: "gateway",
        sessionId: undefined,
        spanId: "span-call",
        spanName: "POST billing",
        startTimeMs: 1_030,
        statusCode: "STATUS_CODE_UNSET",
        toolName: undefined,
        traceId: "trace-1"
      }
    ]);

    const overview = store.getOverview({
      endTimeMs: 5_000,
      startTimeMs: 0
    });

    expect(overview.summary.spanCount).toBe(3);
    expect(overview.summary.traceCount).toBe(1);
    expect(overview.services[0]).toMatchObject({
      operationCount: 3,
      serviceName: "gateway",
      spanCount: 3
    });
    expect(overview.hotspots.map((entry) => entry.category)).toEqual([
      "graphql",
      "service_call",
      "db"
    ]);
    expect(overview.edges[0]).toMatchObject({
      count: 1,
      fromService: "gateway",
      toService: "billing"
    });
  });

  it("groups session and tool-call data for agent traces", () => {
    const database = createSqliteDatabase(path.join(tempDir, "telemetry.sqlite"));
    const store = createSpanStore(database);

    store.insertSpans([
      {
        attributes: {
          "gen_ai.session.id": "sess-1"
        },
        category: "agent_session",
        durationMs: 900,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex"
        },
        serviceName: "codex",
        sessionId: "sess-1",
        spanId: "session-root",
        spanName: "session.run",
        startTimeMs: 5_000,
        statusCode: "STATUS_CODE_UNSET",
        toolName: undefined,
        traceId: "trace-agent"
      },
      {
        attributes: {
          "gen_ai.session.id": "sess-1",
          "tool.name": "exec_command"
        },
        category: "tool_call",
        durationMs: 120,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: "session-root",
        resourceAttributes: {
          "service.name": "codex"
        },
        serviceName: "codex",
        sessionId: "sess-1",
        spanId: "tool-1",
        spanName: "tool.exec_command",
        startTimeMs: 5_100,
        statusCode: "STATUS_CODE_UNSET",
        toolName: "exec_command",
        traceId: "trace-agent"
      },
      {
        attributes: {
          "gen_ai.session.id": "sess-1",
          "tool.name": "write_stdin"
        },
        category: "tool_call",
        durationMs: 80,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: "session-root",
        resourceAttributes: {
          "service.name": "codex"
        },
        serviceName: "codex",
        sessionId: "sess-1",
        spanId: "tool-2",
        spanName: "tool.write_stdin",
        startTimeMs: 5_300,
        statusCode: "STATUS_CODE_UNSET",
        toolName: "write_stdin",
        traceId: "trace-agent"
      }
    ]);

    const sessions = store.listSessions({
      endTimeMs: 10_000,
      startTimeMs: 0
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      serviceName: "codex",
      sessionId: "sess-1",
      toolCallCount: 2,
      toolNames: ["exec_command", "write_stdin"],
      traceCount: 1
    });
  });

  it("creates synthetic sessions for tool-call traffic without explicit session ids", () => {
    const database = createSqliteDatabase(path.join(tempDir, "telemetry.sqlite"));
    const store = createSpanStore(database);

    store.insertSpans([
      {
        attributes: {
          call_id: "call-1",
          tool_name: "exec_command"
        },
        category: "tool_call",
        durationMs: 120,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex-app-server"
        },
        serviceName: "codex-app-server",
        sessionId: undefined,
        spanId: "tool-call-1",
        spanName: "exec_command",
        startTimeMs: 1_800_001,
        statusCode: "STATUS_CODE_UNSET",
        toolName: "exec_command",
        traceId: "trace-agent-1"
      }
    ]);

    const sessions = store.listSessions({
      endTimeMs: 10_000_000,
      startTimeMs: 0
    });
    const overview = store.getOverview({
      endTimeMs: 10_000_000,
      startTimeMs: 0
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId.startsWith("codex-app-server@")).toBe(true);
    expect(sessions[0]).toMatchObject({
      toolCallCount: 1,
      toolNames: ["exec_command"],
      traceCount: 1
    });
    expect(overview.summary.sessionCount).toBe(1);
  });
});
