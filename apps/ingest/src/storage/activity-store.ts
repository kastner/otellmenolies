import type { LogRecord } from "../logs/types.js";
import type { SpanRecord } from "./span-store.js";
import type { SqliteDatabase } from "./sqlite.js";

type BucketPoint = {
  bucketStartMs: number;
  value: number;
};

type ServiceBreakdown = {
  inputTokens: number;
  outputTokens: number;
  serviceName: string;
  toolCallCount: number;
};

type UnifiedOverview = {
  byService: ServiceBreakdown[];
  inputTokenTimeline: BucketPoint[];
  outputTokenTimeline: BucketPoint[];
  summary: {
    cacheReadTokens: number;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
    totalCostUsd: number;
  };
  toolCallTimeline: BucketPoint[];
  tools: Array<{
    avgDurationMs: number;
    callCount: number;
    lastCalledAt: number;
    serviceName: string;
    toolName: string;
  }>;
};

type TimeRange = {
  endTimeMs: number;
  startTimeMs: number;
};

export type ActivityStore = {
  getUnifiedOverview: (
    range: TimeRange & { bucketSizeSeconds: number }
  ) => UnifiedOverview;
  insertFromLogs: (logs: LogRecord[]) => void;
  insertFromSpans: (spans: SpanRecord[]) => void;
};

export function createActivityStore(database: SqliteDatabase): ActivityStore {
  const insertStatement = database.prepare(`
    INSERT OR IGNORE INTO agent_events (
      source_id, timestamp_ms, service_name, event_type,
      session_id, model, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, cost_usd,
      duration_ms, tool_name, tool_success, attributes_json
    ) VALUES (
      @sourceId, @timestampMs, @serviceName, @eventType,
      @sessionId, @model, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheCreationTokens, @costUsd,
      @durationMs, @toolName, @toolSuccess, @attributesJson
    )
  `);

  const insertMany = database.transaction(
    (
      rows: Array<{
        attributesJson: string;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        costUsd: number | null;
        durationMs: number | null;
        eventType: string;
        inputTokens: number;
        model: string | null;
        outputTokens: number;
        serviceName: string;
        sessionId: string | null;
        sourceId: string;
        timestampMs: number;
        toolName: string | null;
        toolSuccess: number | null;
      }>
    ) => {
      for (const row of rows) {
        insertStatement.run(row);
      }
    }
  );

  return {
    getUnifiedOverview(range) {
      const summaryRow = database
        .prepare(
          `
          SELECT
            COALESCE(SUM(CASE WHEN event_type = 'api_request' THEN input_tokens ELSE 0 END), 0) AS inputTokens,
            COALESCE(SUM(CASE WHEN event_type = 'api_request' THEN output_tokens ELSE 0 END), 0) AS outputTokens,
            COALESCE(SUM(CASE WHEN event_type = 'api_request' THEN cache_read_tokens ELSE 0 END), 0) AS cacheReadTokens,
            COALESCE(SUM(CASE WHEN event_type = 'api_request' THEN cost_usd ELSE 0 END), 0) AS totalCostUsd,
            COALESCE(SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END), 0) AS toolCallCount
          FROM agent_events
          WHERE timestamp_ms BETWEEN ? AND ?
        `
        )
        .get(range.startTimeMs, range.endTimeMs) as {
        cacheReadTokens: number;
        inputTokens: number;
        outputTokens: number;
        toolCallCount: number;
        totalCostUsd: number;
      };

      const byService = database
        .prepare(
          `
          SELECT
            service_name AS serviceName,
            COALESCE(SUM(CASE WHEN event_type = 'api_request' THEN input_tokens ELSE 0 END), 0) AS inputTokens,
            COALESCE(SUM(CASE WHEN event_type = 'api_request' THEN output_tokens ELSE 0 END), 0) AS outputTokens,
            COALESCE(SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END), 0) AS toolCallCount
          FROM agent_events
          WHERE timestamp_ms BETWEEN ? AND ?
          GROUP BY service_name
          ORDER BY inputTokens DESC
        `
        )
        .all(range.startTimeMs, range.endTimeMs) as ServiceBreakdown[];

      const tokenRows = database
        .prepare(
          `
          SELECT timestamp_ms AS timestampMs, input_tokens AS inputTokens, output_tokens AS outputTokens
          FROM agent_events
          WHERE timestamp_ms BETWEEN ? AND ?
            AND event_type = 'api_request'
          ORDER BY timestamp_ms ASC
        `
        )
        .all(range.startTimeMs, range.endTimeMs) as Array<{
        inputTokens: number;
        outputTokens: number;
        timestampMs: number;
      }>;

      const toolCallRows = database
        .prepare(
          `
          SELECT timestamp_ms AS timestampMs
          FROM agent_events
          WHERE timestamp_ms BETWEEN ? AND ?
            AND event_type = 'tool_call'
          ORDER BY timestamp_ms ASC
        `
        )
        .all(range.startTimeMs, range.endTimeMs) as Array<{
        timestampMs: number;
      }>;

      const tools = database
        .prepare(
          `
          SELECT
            tool_name AS toolName,
            service_name AS serviceName,
            COUNT(*) AS callCount,
            ROUND(AVG(duration_ms), 2) AS avgDurationMs,
            MAX(timestamp_ms) AS lastCalledAt
          FROM agent_events
          WHERE timestamp_ms BETWEEN ? AND ?
            AND event_type = 'tool_call'
            AND tool_name IS NOT NULL
          GROUP BY tool_name, service_name
          ORDER BY callCount DESC, lastCalledAt DESC
          LIMIT 30
        `
        )
        .all(range.startTimeMs, range.endTimeMs) as UnifiedOverview["tools"];

      const buckets = createBuckets(
        range.startTimeMs,
        range.endTimeMs,
        range.bucketSizeSeconds
      );

      const inputTokenTimeline = buckets.map((b) => ({
        bucketStartMs: b,
        value: 0,
      }));
      const outputTokenTimeline = buckets.map((b) => ({
        bucketStartMs: b,
        value: 0,
      }));
      const toolCallTimeline = buckets.map((b) => ({
        bucketStartMs: b,
        value: 0,
      }));

      for (const row of tokenRows) {
        const idx = resolveBucketIndex(
          row.timestampMs,
          range.startTimeMs,
          range.bucketSizeSeconds,
          buckets.length
        );
        if (idx !== null) {
          inputTokenTimeline[idx]!.value += row.inputTokens;
          outputTokenTimeline[idx]!.value += row.outputTokens;
        }
      }

      for (const row of toolCallRows) {
        const idx = resolveBucketIndex(
          row.timestampMs,
          range.startTimeMs,
          range.bucketSizeSeconds,
          buckets.length
        );
        if (idx !== null) {
          toolCallTimeline[idx]!.value += 1;
        }
      }

      return {
        byService,
        inputTokenTimeline,
        outputTokenTimeline,
        summary: summaryRow,
        toolCallTimeline,
        tools,
      };
    },

    insertFromLogs(logs) {
      const rows: Parameters<typeof insertMany>[0] = [];

      for (const log of logs) {
        const attrs = log.attributes as Record<string, string | undefined>;
        const eventName = attrs["event.name"];
        const sessionId = attrs["session.id"] ?? null;

        if (eventName === "api_request") {
          const seq = attrs["event.sequence"] ?? String(log.timestampMs);
          rows.push({
            attributesJson: JSON.stringify({
              model: attrs["model"],
              speed: attrs["speed"],
            }),
            cacheCreationTokens: parseInt(attrs["cache_creation_tokens"] ?? "0", 10) || 0,
            cacheReadTokens: parseInt(attrs["cache_read_tokens"] ?? "0", 10) || 0,
            costUsd: parseFloat(attrs["cost_usd"] ?? "0") || null,
            durationMs: parseFloat(attrs["duration_ms"] ?? "0") || null,
            eventType: "api_request",
            inputTokens: parseInt(attrs["input_tokens"] ?? "0", 10) || 0,
            model: attrs["model"] ?? null,
            outputTokens: parseInt(attrs["output_tokens"] ?? "0", 10) || 0,
            serviceName: log.serviceName,
            sessionId,
            sourceId: `log:${sessionId}:${seq}:api`,
            timestampMs: log.timestampMs,
            toolName: null,
            toolSuccess: null,
          });
        } else if (
          eventName === "tool_result" ||
          eventName === "codex.tool_result"
        ) {
          const seq = attrs["event.sequence"] ?? String(log.timestampMs);
          rows.push({
            attributesJson: JSON.stringify({
              decision_source: attrs["decision_source"],
              tool_result_size_bytes: attrs["tool_result_size_bytes"],
            }),
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            costUsd: null,
            durationMs: parseFloat(attrs["duration_ms"] ?? "0") || null,
            eventType: "tool_call",
            inputTokens: 0,
            model: null,
            outputTokens: 0,
            serviceName: log.serviceName,
            sessionId,
            sourceId: `log:${sessionId}:${seq}:tool`,
            timestampMs: log.timestampMs,
            toolName: attrs["tool_name"] ?? null,
            toolSuccess: attrs["success"] === "true" ? 1 : 0,
          });
        }
      }

      if (rows.length > 0) {
        insertMany(rows);
      }
    },

    insertFromSpans(spans) {
      const rows: Parameters<typeof insertMany>[0] = [];

      for (const span of spans) {
        if (span.inputTokens || span.outputTokens) {
          rows.push({
            attributesJson: JSON.stringify({ spanName: span.spanName }),
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            costUsd: null,
            durationMs: span.durationMs,
            eventType: "api_request",
            inputTokens: span.inputTokens ?? 0,
            model: null,
            outputTokens: span.outputTokens ?? 0,
            serviceName: span.serviceName,
            sessionId: span.sessionId ?? null,
            sourceId: `span:${span.spanId}:api`,
            timestampMs: span.startTimeMs,
            toolName: null,
            toolSuccess: null,
          });
        }

        if (span.toolName) {
          rows.push({
            attributesJson: JSON.stringify({
              arguments: span.toolArguments,
              toolCallId: span.toolCallId,
            }),
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            costUsd: null,
            durationMs: span.durationMs,
            eventType: "tool_call",
            inputTokens: 0,
            model: null,
            outputTokens: 0,
            serviceName: span.serviceName,
            sessionId: span.sessionId ?? null,
            sourceId: `span:${span.spanId}:tool`,
            timestampMs: span.startTimeMs,
            toolName: span.toolName,
            toolSuccess: null,
          });
        }
      }

      if (rows.length > 0) {
        insertMany(rows);
      }
    },
  };
}

function createBuckets(
  startTimeMs: number,
  endTimeMs: number,
  bucketSizeSeconds: number
) {
  const bucketSizeMs = bucketSizeSeconds * 1_000;
  const bucketStart = Math.floor(startTimeMs / bucketSizeMs) * bucketSizeMs;
  const buckets: number[] = [];

  for (let current = bucketStart; current < endTimeMs; current += bucketSizeMs) {
    buckets.push(current);
  }

  return buckets;
}

function resolveBucketIndex(
  timestampMs: number,
  rangeStartMs: number,
  bucketSizeSeconds: number,
  bucketCount: number
) {
  const bucketSizeMs = bucketSizeSeconds * 1_000;
  const bucketStart = Math.floor(rangeStartMs / bucketSizeMs) * bucketSizeMs;
  const index = Math.floor((timestampMs - bucketStart) / bucketSizeMs);

  if (index < 0 || index >= bucketCount) {
    return null;
  }

  return index;
}
