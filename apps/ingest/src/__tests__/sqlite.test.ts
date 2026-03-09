import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createSqliteDatabase } from "../storage/sqlite.js";

describe("sqlite migrations", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `otellmenolies-sqlite-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, {
      force: true,
      recursive: true
    });
  });

  it("upgrades an existing spans table before creating indexes on new columns", () => {
    const databasePath = path.join(tempDir, "telemetry.sqlite");
    fsSync.mkdirSync(tempDir, {
      recursive: true
    });
    const legacyDatabase = new Database(databasePath);

    legacyDatabase.exec(`
      CREATE TABLE spans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL UNIQUE,
        parent_span_id TEXT,
        service_name TEXT NOT NULL,
        span_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        category TEXT NOT NULL,
        start_time_ms INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        status_code TEXT NOT NULL,
        session_id TEXT,
        tool_name TEXT,
        peer_service TEXT,
        attributes_json TEXT NOT NULL,
        resource_attributes_json TEXT NOT NULL
      );
    `);
    legacyDatabase.close();

    const migrated = createSqliteDatabase(databasePath);
    const columns = migrated
      .prepare(`PRAGMA table_info(spans)`)
      .all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "conversation_id",
        "input_tokens",
        "output_tokens",
        "tool_call_id",
        "tool_arguments"
      ])
    );

    migrated.close();
  });

  it("prunes high-volume codex app spans while preserving useful tool call rows", () => {
    const databasePath = path.join(tempDir, "telemetry.sqlite");
    const database = createSqliteDatabase(databasePath);

    database.exec(`
      INSERT INTO spans (
        trace_id,
        span_id,
        parent_span_id,
        service_name,
        span_name,
        kind,
        category,
        start_time_ms,
        duration_ms,
        status_code,
        session_id,
        conversation_id,
        input_tokens,
        output_tokens,
        tool_name,
        tool_call_id,
        tool_arguments,
        peer_service,
        attributes_json,
        resource_attributes_json
      )
      VALUES
        (
          'trace-noise',
          'span-noise',
          NULL,
          'codex-app-server',
          'FramedRead::poll_next',
          'SPAN_KIND_INTERNAL',
          'app',
          1000,
          1,
          'STATUS_CODE_UNSET',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          '{}',
          '{}'
        ),
        (
          'trace-tool',
          'span-tool',
          NULL,
          'codex-app-server',
          'exec_command',
          'SPAN_KIND_INTERNAL',
          'tool_call',
          2000,
          2,
          'STATUS_CODE_UNSET',
          'sess-1',
          'conv-1',
          NULL,
          NULL,
          'exec_command',
          'call-1',
          '{\"cmd\":\"pwd\"}',
          NULL,
          '{}',
          '{}'
        );
    `);
    database.close();

    const reopened = createSqliteDatabase(databasePath);
    const rows = reopened
      .prepare(
        "SELECT span_id AS spanId, category, span_name AS spanName, tool_name AS toolName FROM spans ORDER BY start_time_ms ASC"
      )
      .all() as Array<{
      category: string;
      spanId: string;
      spanName: string;
      toolName: string | null;
    }>;

    expect(rows).toEqual([
      {
        category: "tool_call",
        spanId: "span-tool",
        spanName: "exec_command",
        toolName: "exec_command"
      }
    ]);

    reopened.close();
  });

  it("binds existing plain named-parameter objects under Bun", () => {
    const databasePath = path.join(tempDir, "telemetry.sqlite");
    const database = createSqliteDatabase(databasePath);

    database
      .prepare(
        `
          INSERT INTO spans (
            trace_id,
            span_id,
            parent_span_id,
            service_name,
            span_name,
            kind,
            category,
            start_time_ms,
            duration_ms,
            status_code,
            session_id,
            conversation_id,
            input_tokens,
            output_tokens,
            tool_name,
            tool_call_id,
            tool_arguments,
            peer_service,
            attributes_json,
            resource_attributes_json
          ) VALUES (
            @traceId,
            @spanId,
            @parentSpanId,
            @serviceName,
            @spanName,
            @kind,
            @category,
            @startTimeMs,
            @durationMs,
            @statusCode,
            @sessionId,
            @conversationId,
            @inputTokens,
            @outputTokens,
            @toolName,
            @toolCallId,
            @toolArguments,
            @peerService,
            @attributesJson,
            @resourceAttributesJson
          )
        `
      )
      .run({
        attributesJson: JSON.stringify({
          key: "value"
        }),
        category: "tool_call",
        conversationId: "conv-1",
        durationMs: 15,
        inputTokens: 10,
        kind: "SPAN_KIND_INTERNAL",
        outputTokens: 12,
        parentSpanId: null,
        peerService: "peer",
        resourceAttributesJson: JSON.stringify({
          service: "worker"
        }),
        serviceName: "svc",
        sessionId: "sess-1",
        spanId: "span-1",
        spanName: "exec_command",
        startTimeMs: 1234,
        statusCode: "STATUS_CODE_UNSET",
        toolArguments: "{\"cmd\":\"pwd\"}",
        toolCallId: "call-1",
        toolName: "exec_command",
        traceId: "trace-1"
      });

    const inserted = database
      .prepare(
        `
          SELECT
            trace_id AS traceId,
            span_id AS spanId,
            conversation_id AS conversationId,
            tool_name AS toolName
          FROM spans
          WHERE span_id = ?
        `
      )
      .get("span-1") as {
      conversationId: string | null;
      spanId: string;
      toolName: string | null;
      traceId: string;
    };

    expect(inserted).toEqual({
      conversationId: "conv-1",
      spanId: "span-1",
      toolName: "exec_command",
      traceId: "trace-1"
    });

    database.close();
  });
});
