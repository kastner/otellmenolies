import type { SqliteDatabase } from "./sqlite.js";

export type SpanRecord = {
  attributes: Record<string, unknown>;
  category: string;
  conversationId?: string;
  durationMs: number;
  inputTokens?: number;
  kind: string;
  outputTokens?: number;
  parentSpanId?: string;
  resourceAttributes: Record<string, unknown>;
  serviceName: string;
  sessionId?: string;
  spanId: string;
  spanName: string;
  startTimeMs: number;
  statusCode: string;
  toolArguments?: string;
  toolCallId?: string;
  toolName?: string;
  traceId: string;
};

type TimeRange = {
  endTimeMs: number;
  startTimeMs: number;
};

type ServiceSummary = {
  avgDurationMs: number;
  operationCount: number;
  serviceName: string;
  spanCount: number;
};

type Hotspot = {
  avgDurationMs: number;
  category: string;
  operationName: string;
  p95DurationMs: number;
  serviceName: string;
  spanCount: number;
};

type ServiceEdge = {
  count: number;
  fromService: string;
  toService: string;
};

type SessionSummary = {
  firstSeenAt: number;
  lastSeenAt: number;
  serviceName: string;
  sessionId: string;
  toolCallCount: number;
  toolNames: string[];
  traceCount: number;
};

type BucketPoint = {
  bucketStartMs: number;
  value: number;
};

type AgentConversationSummary = {
  conversationId: string;
  durationMs: number;
  firstSeenAt: number;
  inputTokens: number;
  lastSeenAt: number;
  outputTokens: number;
  serviceName: string;
  toolCallCount: number;
  toolNames: string[];
  traceCount: number;
};

type ToolUsageSummary = {
  avgDurationMs: number;
  callCount: number;
  lastCalledAt: number;
  toolName: string;
};

type ToolCallInstance = {
  arguments?: string;
  calledAt: number;
  conversationId?: string;
  durationMs: number;
  serviceName: string;
  spanId: string;
  toolCallId?: string;
  toolName: string;
  traceId: string;
};

type AgentOverview = {
  conversationTimeline: BucketPoint[];
  conversations: AgentConversationSummary[];
  durationTimeline: BucketPoint[];
  inputTokenTimeline: BucketPoint[];
  outputTokenTimeline: BucketPoint[];
  summary: {
    conversationCount: number;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
  };
};

type ToolUsage = {
  selectedTool?: {
    calls: ToolCallInstance[];
    toolName: string;
  };
  tools: ToolUsageSummary[];
};

type TraceRow = {
  attributesJson: string;
  category: string;
  conversationId?: string | null;
  durationMs: number;
  inputTokens?: number | null;
  kind: string;
  outputTokens?: number | null;
  parentSpanId?: string | null;
  peerService?: string | null;
  resourceAttributesJson: string;
  serviceName: string;
  sessionId?: string | null;
  spanId: string;
  spanName: string;
  startTimeMs: number;
  statusCode: string;
  toolArguments?: string | null;
  toolCallId?: string | null;
  toolName?: string | null;
  traceId: string;
};

export type SpanStore = {
  getAgentOverview: (range: TimeRange & { bucketSizeSeconds: number }) => AgentOverview;
  getOverview: (range: TimeRange) => {
    edges: ServiceEdge[];
    hotspots: Hotspot[];
    services: ServiceSummary[];
    summary: {
      sessionCount: number;
      spanCount: number;
      traceCount: number;
    };
  };
  getRecentTraces: (range: TimeRange, limit: number) => Array<{
    durationMs: number;
    rootSpanName: string;
    serviceName: string;
    spanCount: number;
    traceId: string;
  }>;
  getTrace: (traceId: string) => Array<SpanRecord & { peerService?: string }>;
  getToolUsage: (options: TimeRange & { limit: number; toolName?: string }) => ToolUsage;
  insertSpans: (spans: SpanRecord[]) => void;
  listSessions: (range: TimeRange) => SessionSummary[];
};

export function createSpanStore(database: SqliteDatabase): SpanStore {
  const insertStatement = database.prepare(`
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
    VALUES (
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
    ON CONFLICT(span_id) DO UPDATE SET
      parent_span_id = excluded.parent_span_id,
      service_name = excluded.service_name,
      span_name = excluded.span_name,
      kind = excluded.kind,
      category = excluded.category,
      start_time_ms = excluded.start_time_ms,
      duration_ms = excluded.duration_ms,
      status_code = excluded.status_code,
      session_id = excluded.session_id,
      conversation_id = excluded.conversation_id,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      tool_name = excluded.tool_name,
      tool_call_id = excluded.tool_call_id,
      tool_arguments = excluded.tool_arguments,
      peer_service = excluded.peer_service,
      attributes_json = excluded.attributes_json,
      resource_attributes_json = excluded.resource_attributes_json
  `);

  const insertMany = database.transaction((spans: SpanRecord[]) => {
    for (const span of spans) {
      insertStatement.run({
        attributesJson: JSON.stringify(span.attributes),
        category: span.category,
        conversationId: span.conversationId ?? resolveConversationId(span),
        durationMs: span.durationMs,
        inputTokens: span.inputTokens ?? null,
        kind: span.kind,
        outputTokens: span.outputTokens ?? null,
        parentSpanId: span.parentSpanId ?? null,
        peerService: inferPeerService(span),
        resourceAttributesJson: JSON.stringify(span.resourceAttributes),
        serviceName: span.serviceName,
        sessionId: span.sessionId ?? null,
        spanId: span.spanId,
        spanName: span.spanName,
        startTimeMs: span.startTimeMs,
        statusCode: span.statusCode,
        toolArguments: span.toolArguments ?? null,
        toolCallId: span.toolCallId ?? null,
        toolName: span.toolName ?? null,
        traceId: span.traceId
      });
    }
  });

  return {
    getAgentOverview(range) {
      const conversationRows = listConversationRows(database, range);
      const tokenRows = database
        .prepare(
          `
            SELECT
              start_time_ms AS startTimeMs,
              COALESCE(input_tokens, 0) AS inputTokens,
              COALESCE(output_tokens, 0) AS outputTokens
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
              AND (input_tokens IS NOT NULL OR output_tokens IS NOT NULL)
            ORDER BY start_time_ms ASC
          `
        )
        .all(range.startTimeMs, range.endTimeMs) as Array<{
        inputTokens: number;
        outputTokens: number;
        startTimeMs: number;
      }>;

      const buckets = createBuckets(range.startTimeMs, range.endTimeMs, range.bucketSizeSeconds);
      const conversationTimeline = buckets.map((bucketStartMs) => ({
        bucketStartMs,
        value: 0
      }));
      const inputTokenTimeline = buckets.map((bucketStartMs) => ({
        bucketStartMs,
        value: 0
      }));
      const outputTokenTimeline = buckets.map((bucketStartMs) => ({
        bucketStartMs,
        value: 0
      }));
      const durationTimeline = buckets.map((bucketStartMs) => ({
        bucketStartMs,
        value: 0
      }));
      const durationTotals = new Map<number, { count: number; total: number }>();

      for (const row of conversationRows) {
        const bucketIndex = resolveBucketIndex(
          row.firstSeenAt,
          range.startTimeMs,
          range.bucketSizeSeconds,
          buckets.length
        );

        if (bucketIndex === null) {
          continue;
        }

        conversationTimeline[bucketIndex]!.value += 1;
        const currentDuration = durationTotals.get(bucketIndex) ?? {
          count: 0,
          total: 0
        };
        currentDuration.count += 1;
        currentDuration.total += row.lastSeenAt - row.firstSeenAt;
        durationTotals.set(bucketIndex, currentDuration);
      }

      for (const row of tokenRows) {
        const bucketIndex = resolveBucketIndex(
          row.startTimeMs,
          range.startTimeMs,
          range.bucketSizeSeconds,
          buckets.length
        );

        if (bucketIndex === null) {
          continue;
        }

        inputTokenTimeline[bucketIndex]!.value += row.inputTokens;
        outputTokenTimeline[bucketIndex]!.value += row.outputTokens;
      }

      for (const [bucketIndex, totals] of durationTotals.entries()) {
        durationTimeline[bucketIndex]!.value =
          totals.count > 0 ? totals.total / totals.count : 0;
      }

      return {
        conversationTimeline,
        conversations: hydrateConversationRows(database, conversationRows),
        durationTimeline,
        inputTokenTimeline,
        outputTokenTimeline,
        summary: {
          conversationCount: conversationRows.length,
          inputTokens: tokenRows.reduce((sum, row) => sum + row.inputTokens, 0),
          outputTokens: tokenRows.reduce((sum, row) => sum + row.outputTokens, 0),
          toolCallCount: conversationRows.reduce((sum, row) => sum + row.toolCallCount, 0)
        }
      };
    },
    getOverview(range) {
      const summary = database
        .prepare(
          `
            SELECT
              COUNT(*) AS spanCount,
              COUNT(DISTINCT trace_id) AS traceCount,
              COUNT(DISTINCT ${conversationIdSql}) AS sessionCount
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
          `
        )
        .get(range.startTimeMs, range.endTimeMs) as {
        sessionCount: number;
        spanCount: number;
        traceCount: number;
      };

      const services = database
        .prepare(
          `
            SELECT
              service_name AS serviceName,
              COUNT(*) AS spanCount,
              COUNT(DISTINCT span_name) AS operationCount,
              ROUND(AVG(duration_ms), 2) AS avgDurationMs
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
            GROUP BY service_name
            ORDER BY spanCount DESC, service_name ASC
          `
        )
        .all(range.startTimeMs, range.endTimeMs) as ServiceSummary[];

      const hotspotsRaw = database
        .prepare(
          `
            SELECT
              service_name AS serviceName,
              span_name AS operationName,
              category,
              COUNT(*) AS spanCount,
              ROUND(AVG(duration_ms), 2) AS avgDurationMs
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
            GROUP BY service_name, span_name, category
            ORDER BY avgDurationMs DESC, spanCount DESC
            LIMIT 12
          `
        )
        .all(range.startTimeMs, range.endTimeMs) as Array<
          Omit<Hotspot, "p95DurationMs">
        >;

      const hotspots = hotspotsRaw.map((row) => ({
        ...row,
        p95DurationMs: row.avgDurationMs
      }));

      const edges = database
        .prepare(
          `
            SELECT
              service_name AS fromService,
              peer_service AS toService,
              COUNT(*) AS count
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
              AND peer_service IS NOT NULL
            GROUP BY service_name, peer_service
            ORDER BY count DESC, fromService ASC, toService ASC
          `
        )
        .all(range.startTimeMs, range.endTimeMs) as ServiceEdge[];

      return {
        edges,
        hotspots,
        services,
        summary
      };
    },
    getRecentTraces(range, limit) {
      return database
        .prepare(
          `
            SELECT
              trace_id AS traceId,
              MIN(service_name) AS serviceName,
              MIN(span_name) AS rootSpanName,
              COUNT(*) AS spanCount,
              ROUND(SUM(duration_ms), 2) AS durationMs
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
            GROUP BY trace_id
            ORDER BY MAX(start_time_ms) DESC
            LIMIT ?
          `
        )
        .all(range.startTimeMs, range.endTimeMs, limit) as Array<{
        durationMs: number;
        rootSpanName: string;
        serviceName: string;
        spanCount: number;
        traceId: string;
      }>;
    },
    getTrace(traceId) {
      return database
        .prepare(
          `
            SELECT
              trace_id AS traceId,
              span_id AS spanId,
              parent_span_id AS parentSpanId,
              service_name AS serviceName,
              span_name AS spanName,
              kind,
              category,
              start_time_ms AS startTimeMs,
              duration_ms AS durationMs,
              status_code AS statusCode,
              session_id AS sessionId,
              conversation_id AS conversationId,
              input_tokens AS inputTokens,
              output_tokens AS outputTokens,
              tool_name AS toolName,
              tool_call_id AS toolCallId,
              tool_arguments AS toolArguments,
              peer_service AS peerService,
              attributes_json AS attributesJson,
              resource_attributes_json AS resourceAttributesJson
            FROM spans
            WHERE trace_id = ?
            ORDER BY start_time_ms ASC
          `
        )
        .all(traceId)
        .map((row) => {
          const typedRow = row as TraceRow;

          return {
            attributes: JSON.parse(typedRow.attributesJson),
            category: typedRow.category,
            durationMs: typedRow.durationMs,
            inputTokens: typedRow.inputTokens ?? undefined,
            kind: typedRow.kind,
            outputTokens: typedRow.outputTokens ?? undefined,
            parentSpanId: typedRow.parentSpanId ?? undefined,
            peerService: typedRow.peerService ?? undefined,
            resourceAttributes: JSON.parse(typedRow.resourceAttributesJson),
            serviceName: typedRow.serviceName,
            sessionId: typedRow.sessionId ?? undefined,
            conversationId: typedRow.conversationId ?? undefined,
            spanId: typedRow.spanId,
            spanName: typedRow.spanName,
            startTimeMs: typedRow.startTimeMs,
            statusCode: typedRow.statusCode,
            toolArguments: typedRow.toolArguments ?? undefined,
            toolCallId: typedRow.toolCallId ?? undefined,
            toolName: typedRow.toolName ?? undefined,
            traceId: typedRow.traceId
          };
        });
    },
    getToolUsage({ endTimeMs, limit, startTimeMs, toolName }) {
      const tools = database
        .prepare(
          `
            SELECT
              tool_name AS toolName,
              COUNT(*) AS callCount,
              ROUND(AVG(duration_ms), 2) AS avgDurationMs,
              MAX(start_time_ms) AS lastCalledAt
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
              AND tool_name IS NOT NULL
            GROUP BY tool_name
            ORDER BY callCount DESC, lastCalledAt DESC, toolName ASC
            LIMIT ?
          `
        )
        .all(startTimeMs, endTimeMs, limit) as ToolUsageSummary[];

      const selectedTool = toolName
        ? {
            calls: database
              .prepare(
                `
                  SELECT
                    span_id AS spanId,
                    trace_id AS traceId,
                    service_name AS serviceName,
                    start_time_ms AS calledAt,
                    duration_ms AS durationMs,
                    ${conversationIdSql} AS conversationId,
                    tool_call_id AS toolCallId,
                    tool_arguments AS arguments,
                    tool_name AS toolName
                  FROM spans
                  WHERE start_time_ms BETWEEN ? AND ?
                    AND tool_name = ?
                  ORDER BY
                    CASE WHEN tool_arguments IS NOT NULL THEN 0 ELSE 1 END ASC,
                    CASE WHEN tool_call_id IS NOT NULL THEN 0 ELSE 1 END ASC,
                    calledAt DESC
                  LIMIT 25
                `
              )
              .all(startTimeMs, endTimeMs, toolName) as ToolCallInstance[],
            toolName
          }
        : undefined;

      return {
        selectedTool,
        tools
      };
    },
    insertSpans(spans) {
      insertMany(spans);
    },
    listSessions(range) {
      return hydrateConversationRows(database, listConversationRows(database, range)).map((row) => ({
        ...row,
        sessionId: row.conversationId
      }));
    }
  };
}

function listConversationRows(
  database: SqliteDatabase,
  range: TimeRange
) {
  return database
    .prepare(
      `
        SELECT
          ${conversationIdSql} AS conversationId,
          MIN(service_name) AS serviceName,
          COUNT(DISTINCT trace_id) AS traceCount,
          SUM(CASE WHEN category = 'tool_call' THEN 1 ELSE 0 END) AS toolCallCount,
          MIN(start_time_ms) AS firstSeenAt,
          MAX(start_time_ms) AS lastSeenAt,
          COALESCE(SUM(input_tokens), 0) AS inputTokens,
          COALESCE(SUM(output_tokens), 0) AS outputTokens
        FROM spans
        WHERE start_time_ms BETWEEN ? AND ?
          AND ${conversationIdSql} IS NOT NULL
        GROUP BY conversationId
        ORDER BY lastSeenAt DESC
      `
    )
    .all(range.startTimeMs, range.endTimeMs) as Array<
    Omit<AgentConversationSummary, "durationMs" | "toolNames">
  >;
}

function hydrateConversationRows(
  database: SqliteDatabase,
  rows: Array<Omit<AgentConversationSummary, "durationMs" | "toolNames">>
): AgentConversationSummary[] {
  const toolNamesStatement = database.prepare(
    `
      SELECT DISTINCT tool_name AS toolName
      FROM spans
      WHERE ${conversationIdSql} = ?
        AND tool_name IS NOT NULL
      ORDER BY tool_name ASC
    `
  );

  return rows.map((row) => ({
    ...row,
    durationMs: Math.max(0, row.lastSeenAt - row.firstSeenAt),
    toolNames: toolNamesStatement
      .all(row.conversationId)
      .map((entry: unknown) => (entry as { toolName: string }).toolName)
  }));
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

function inferPeerService(span: SpanRecord) {
  const candidates = [
    span.attributes["peer.service"],
    span.attributes["server.address"],
    span.attributes["net.peer.name"],
    span.attributes["http.host"]
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function resolveConversationId(span: SpanRecord) {
  if (span.conversationId) {
    return span.conversationId;
  }

  if (span.sessionId) {
    return span.sessionId;
  }

  if (span.toolName) {
    return `${span.serviceName}@${Math.floor(span.startTimeMs / 1_800_000)}`;
  }

  return undefined;
}

const conversationIdSql = `
  COALESCE(
    conversation_id,
    session_id,
    CASE
      WHEN tool_name IS NOT NULL THEN service_name || '@' || CAST(start_time_ms / 1800000 AS INTEGER)
      ELSE NULL
    END
  )
`;
