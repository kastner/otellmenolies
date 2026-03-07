import type { SqliteDatabase } from "./sqlite.js";

export type SpanRecord = {
  attributes: Record<string, unknown>;
  category: string;
  durationMs: number;
  kind: string;
  parentSpanId?: string;
  resourceAttributes: Record<string, unknown>;
  serviceName: string;
  sessionId?: string;
  spanId: string;
  spanName: string;
  startTimeMs: number;
  statusCode: string;
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

type TraceRow = {
  attributesJson: string;
  category: string;
  durationMs: number;
  kind: string;
  parentSpanId?: string | null;
  peerService?: string | null;
  resourceAttributesJson: string;
  serviceName: string;
  sessionId?: string | null;
  spanId: string;
  spanName: string;
  startTimeMs: number;
  statusCode: string;
  toolName?: string | null;
  traceId: string;
};

export type SpanStore = {
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
      tool_name,
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
      @toolName,
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
      tool_name = excluded.tool_name,
      peer_service = excluded.peer_service,
      attributes_json = excluded.attributes_json,
      resource_attributes_json = excluded.resource_attributes_json
  `);

  const insertMany = database.transaction((spans: SpanRecord[]) => {
    for (const span of spans) {
      insertStatement.run({
        attributesJson: JSON.stringify(span.attributes),
        category: span.category,
        durationMs: span.durationMs,
        kind: span.kind,
        parentSpanId: span.parentSpanId ?? null,
        peerService: inferPeerService(span),
        resourceAttributesJson: JSON.stringify(span.resourceAttributes),
        serviceName: span.serviceName,
        sessionId: span.sessionId ?? null,
        spanId: span.spanId,
        spanName: span.spanName,
        startTimeMs: span.startTimeMs,
        statusCode: span.statusCode,
        toolName: span.toolName ?? null,
        traceId: span.traceId
      });
    }
  });

  return {
    getOverview(range) {
      const summary = database
        .prepare(
          `
            SELECT
              COUNT(*) AS spanCount,
              COUNT(DISTINCT trace_id) AS traceCount,
              COUNT(
                DISTINCT COALESCE(
                  session_id,
                  CASE
                    WHEN tool_name IS NOT NULL THEN service_name || '@' || CAST(start_time_ms / 1800000 AS INTEGER)
                    ELSE NULL
                  END
                )
              ) AS sessionCount
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
              tool_name AS toolName,
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
            kind: typedRow.kind,
            parentSpanId: typedRow.parentSpanId ?? undefined,
            peerService: typedRow.peerService ?? undefined,
            resourceAttributes: JSON.parse(typedRow.resourceAttributesJson),
            serviceName: typedRow.serviceName,
            sessionId: typedRow.sessionId ?? undefined,
            spanId: typedRow.spanId,
            spanName: typedRow.spanName,
            startTimeMs: typedRow.startTimeMs,
            statusCode: typedRow.statusCode,
            toolName: typedRow.toolName ?? undefined,
            traceId: typedRow.traceId
          };
        });
    },
    insertSpans(spans) {
      insertMany(spans);
    },
    listSessions(range) {
      const rows = database
        .prepare(
          `
            SELECT
              COALESCE(
                session_id,
                CASE
                  WHEN tool_name IS NOT NULL THEN service_name || '@' || CAST(start_time_ms / 1800000 AS INTEGER)
                  ELSE NULL
                END
              ) AS sessionId,
              MIN(service_name) AS serviceName,
              COUNT(DISTINCT trace_id) AS traceCount,
              SUM(CASE WHEN category = 'tool_call' THEN 1 ELSE 0 END) AS toolCallCount,
              MIN(start_time_ms) AS firstSeenAt,
              MAX(start_time_ms) AS lastSeenAt
            FROM spans
            WHERE start_time_ms BETWEEN ? AND ?
              AND COALESCE(
                session_id,
                CASE
                  WHEN tool_name IS NOT NULL THEN service_name || '@' || CAST(start_time_ms / 1800000 AS INTEGER)
                  ELSE NULL
                END
              ) IS NOT NULL
            GROUP BY sessionId
            ORDER BY lastSeenAt DESC
          `
        )
        .all(range.startTimeMs, range.endTimeMs) as Array<Omit<SessionSummary, "toolNames">>;

      const toolNamesStatement = database.prepare(
        `
          SELECT DISTINCT tool_name AS toolName
          FROM spans
          WHERE COALESCE(
            session_id,
            CASE
              WHEN tool_name IS NOT NULL THEN service_name || '@' || CAST(start_time_ms / 1800000 AS INTEGER)
              ELSE NULL
            END
          ) = ?
            AND tool_name IS NOT NULL
          ORDER BY tool_name ASC
        `
      );

      return rows.map((row) => ({
        ...row,
        toolNames: toolNamesStatement
          .all(row.sessionId)
          .map((entry: unknown) => (entry as { toolName: string }).toolName)
      }));
    }
  };
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
