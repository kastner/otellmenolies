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

  it("builds agent timelines and tool drilldown data", () => {
    const database = createSqliteDatabase(path.join(tempDir, "telemetry.sqlite"));
    const store = createSpanStore(database);

    store.insertSpans([
      {
        attributes: {
          "conversation.id": "conv-1",
          "gen_ai.usage.input_tokens": 1000
        },
        category: "agent_session",
        conversationId: "conv-1",
        durationMs: 800,
        inputTokens: 1000,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex-app-server"
        },
        serviceName: "codex-app-server",
        sessionId: "conv-1",
        spanId: "conv-root-1",
        spanName: "turn/start",
        startTimeMs: 10_000,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: undefined,
        toolCallId: undefined,
        toolName: undefined,
        traceId: "trace-conv-1"
      },
      {
        attributes: {
          "conversation.id": "conv-1",
          "gen_ai.usage.output_tokens": 250,
          "tool.name": "exec_command"
        },
        category: "tool_call",
        conversationId: "conv-1",
        durationMs: 300,
        inputTokens: undefined,
        kind: "SPAN_KIND_INTERNAL",
        outputTokens: 250,
        parentSpanId: "conv-root-1",
        resourceAttributes: {
          "service.name": "codex-app-server"
        },
        serviceName: "codex-app-server",
        sessionId: "conv-1",
        spanId: "tool-call-1",
        spanName: "handle_tool_call",
        startTimeMs: 11_000,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: '{\n  "cmd": "ls"\n}',
        toolCallId: "call-1",
        toolName: "exec_command",
        traceId: "trace-conv-1"
      },
      {
        attributes: {
          "conversation.id": "conv-2",
          "gen_ai.usage.input_tokens": 400,
          "tool.name": "write_stdin"
        },
        category: "tool_call",
        conversationId: "conv-2",
        durationMs: 120,
        inputTokens: 400,
        kind: "SPAN_KIND_INTERNAL",
        outputTokens: undefined,
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex-app-server"
        },
        serviceName: "codex-app-server",
        sessionId: "conv-2",
        spanId: "tool-call-2",
        spanName: "handle_tool_call",
        startTimeMs: 16_000,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: '{\n  "chars": "hello"\n}',
        toolCallId: "call-2",
        toolName: "write_stdin",
        traceId: "trace-conv-2"
      }
    ]);

    const agentOverview = store.getAgentOverview({
      bucketSizeSeconds: 10,
      endTimeMs: 30_000,
      startTimeMs: 0
    });
    const toolUsage = store.getToolUsage({
      endTimeMs: 30_000,
      limit: 10,
      startTimeMs: 0,
      toolName: "exec_command"
    });

    expect(agentOverview.summary).toMatchObject({
      conversationCount: 2,
      inputTokens: 1400,
      outputTokens: 250,
      toolCallCount: 2
    });
    expect(agentOverview.conversationTimeline).toEqual([
      { bucketStartMs: 0, value: 0 },
      { bucketStartMs: 10_000, value: 2 },
      { bucketStartMs: 20_000, value: 0 }
    ]);
    expect(agentOverview.inputTokenTimeline).toEqual([
      { bucketStartMs: 0, value: 0 },
      { bucketStartMs: 10_000, value: 1400 },
      { bucketStartMs: 20_000, value: 0 }
    ]);
    expect(agentOverview.outputTokenTimeline).toEqual([
      { bucketStartMs: 0, value: 0 },
      { bucketStartMs: 10_000, value: 250 },
      { bucketStartMs: 20_000, value: 0 }
    ]);
    expect(agentOverview.durationTimeline).toEqual([
      { bucketStartMs: 0, value: 0 },
      { bucketStartMs: 10_000, value: 500 },
      { bucketStartMs: 20_000, value: 0 }
    ]);
    expect(agentOverview.conversations[0]).toMatchObject({
      conversationId: "conv-2",
      durationMs: 0,
      inputTokens: 400,
      outputTokens: 0,
      toolCallCount: 1
    });
    expect(agentOverview.conversations[1]).toMatchObject({
      conversationId: "conv-1",
      durationMs: 1_000,
      inputTokens: 1000,
      outputTokens: 250,
      toolCallCount: 1
    });
    expect(toolUsage.tools).toEqual([
      {
        avgDurationMs: 120,
        callCount: 1,
        lastCalledAt: 16_000,
        toolName: "write_stdin"
      },
      {
        avgDurationMs: 300,
        callCount: 1,
        lastCalledAt: 11_000,
        toolName: "exec_command"
      }
    ]);
    expect(toolUsage.selectedTool?.calls).toEqual([
      expect.objectContaining({
        arguments: '{\n  "cmd": "ls"\n}',
        conversationId: "conv-1",
        toolCallId: "call-1",
        toolName: "exec_command"
      })
    ]);
  });

  it("prioritizes tool call instances that retain arguments over duplicate spans", () => {
    const database = createSqliteDatabase(path.join(tempDir, "telemetry.sqlite"));
    const store = createSpanStore(database);

    store.insertSpans([
      {
        attributes: {
          tool_name: "exec_command"
        },
        category: "tool_call",
        conversationId: "conv-1",
        durationMs: 180,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex-app-server"
        },
        serviceName: "codex-app-server",
        sessionId: "conv-1",
        spanId: "arg-call",
        spanName: "handle_tool_call",
        startTimeMs: 11_000,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: '{\n  "cmd": "ls"\n}',
        toolCallId: "call-1",
        toolName: "exec_command",
        traceId: "trace-1"
      },
      {
        attributes: {
          tool_name: "exec_command"
        },
        category: "tool_call",
        conversationId: "conv-1",
        durationMs: 0,
        kind: "SPAN_KIND_INTERNAL",
        parentSpanId: undefined,
        resourceAttributes: {
          "service.name": "codex-app-server"
        },
        serviceName: "codex-app-server",
        sessionId: "conv-1",
        spanId: "bare-call",
        spanName: "handle_responses",
        startTimeMs: 12_000,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: undefined,
        toolCallId: undefined,
        toolName: "exec_command",
        traceId: "trace-1"
      }
    ]);

    const toolUsage = store.getToolUsage({
      endTimeMs: 30_000,
      limit: 10,
      startTimeMs: 0,
      toolName: "exec_command"
    });

    expect(toolUsage.selectedTool?.calls[0]).toMatchObject({
      arguments: '{\n  "cmd": "ls"\n}',
      toolCallId: "call-1"
    });
  });
});
