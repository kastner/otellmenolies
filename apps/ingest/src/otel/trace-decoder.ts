import type { SpanRecord } from "../storage/span-store.js";

type OtlpAttribute = {
  key?: string;
  value?: Record<string, unknown>;
};

type OtlpSpan = {
  attributes?: OtlpAttribute[];
  endTimeUnixNano?: string | number;
  kind?: string | number;
  name?: string;
  parentSpanId?: Buffer | Uint8Array | number[] | string;
  spanId?: Buffer | Uint8Array | number[] | string;
  startTimeUnixNano?: string | number;
  status?: {
    code?: string | number;
  };
  traceId?: Buffer | Uint8Array | number[] | string;
};

type OtlpScopeSpans = {
  spans?: OtlpSpan[];
};

type OtlpResourceSpans = {
  resource?: {
    attributes?: OtlpAttribute[];
  };
  scopeSpans?: OtlpScopeSpans[];
};

export function extractSpansFromTraceExport(request: {
  resourceSpans?: OtlpResourceSpans[];
}): SpanRecord[] {
  const records: SpanRecord[] = [];

  for (const resourceSpan of request.resourceSpans ?? []) {
    const resourceAttributes = attributeListToRecord(
      resourceSpan.resource?.attributes ?? []
    );
    const scopeSpans = resourceSpan.scopeSpans ?? [];

    for (const scopeSpan of scopeSpans) {
      for (const span of scopeSpan.spans ?? []) {
        const attributes = attributeListToRecord(span.attributes ?? []);
        const serviceName = resolveServiceName(resourceAttributes);
        const sessionId = resolveSessionId(attributes, resourceAttributes);
        const toolName = resolveToolName(attributes, span.name);
        const category = resolveCategory(attributes, span.name, toolName, sessionId);
        const startTimeMs = nanosToMilliseconds(span.startTimeUnixNano);
        const endTimeMs = nanosToMilliseconds(span.endTimeUnixNano);

        const record: SpanRecord = {
          attributes,
          category,
          durationMs: Math.max(0, endTimeMs - startTimeMs),
          kind: normalizeEnum(span.kind, "SPAN_KIND_INTERNAL"),
          parentSpanId: bytesToHex(span.parentSpanId),
          resourceAttributes,
          serviceName,
          sessionId,
          spanId: bytesToHex(span.spanId) ?? `missing-span-id-${records.length}`,
          spanName: span.name ?? "unnamed span",
          startTimeMs,
          statusCode: normalizeEnum(span.status?.code, "STATUS_CODE_UNSET"),
          toolName,
          traceId: bytesToHex(span.traceId) ?? `missing-trace-id-${records.length}`
        };

        if (shouldRetainSpan(record)) {
          records.push(record);
        }
      }
    }
  }

  return records;
}

function attributeListToRecord(attributes: OtlpAttribute[]) {
  const record: Record<string, unknown> = {};

  for (const attribute of attributes) {
    if (!attribute.key || !attribute.value) {
      continue;
    }

    record[attribute.key] = anyValueToPrimitive(attribute.value);
  }

  return record;
}

function anyValueToPrimitive(value: Record<string, unknown>): unknown {
  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("boolValue" in value) {
    return value.boolValue;
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("intValue" in value) {
    return Number(value.intValue);
  }

  if ("bytesValue" in value) {
    return bytesToHex(value.bytesValue as Buffer | Uint8Array | number[] | string);
  }

  if ("arrayValue" in value) {
    const arrayValue = value.arrayValue as { values?: Record<string, unknown>[] };
    return (arrayValue.values ?? []).map(anyValueToPrimitive);
  }

  if ("kvlistValue" in value) {
    const kvlistValue = value.kvlistValue as { values?: OtlpAttribute[] };
    return attributeListToRecord(kvlistValue.values ?? []);
  }

  return null;
}

function resolveServiceName(resourceAttributes: Record<string, unknown>) {
  const candidate = resourceAttributes["service.name"];

  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }

  return "unknown-service";
}

function resolveSessionId(
  attributes: Record<string, unknown>,
  resourceAttributes: Record<string, unknown>
) {
  const keys = [
    "gen_ai.session.id",
    "session.id",
    "conversation.id",
    "thread.id"
  ];

  for (const key of keys) {
    const attributeValue = attributes[key];

    if (typeof attributeValue === "string" && attributeValue.length > 0) {
      return attributeValue;
    }

    const resourceValue = resourceAttributes[key];

    if (typeof resourceValue === "string" && resourceValue.length > 0) {
      return resourceValue;
    }
  }

  return undefined;
}

function resolveToolName(
  attributes: Record<string, unknown>,
  spanName?: string
) {
  const keys = ["tool.name", "tool_name", "gen_ai.tool.name", "openai.tool.name"];

  for (const key of keys) {
    const value = attributes[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  if (spanName?.startsWith("tool.")) {
    return spanName.slice("tool.".length);
  }

  return undefined;
}

function resolveCategory(
  attributes: Record<string, unknown>,
  spanName: string | undefined,
  toolName: string | undefined,
  sessionId: string | undefined
) {
  if (toolName) {
    return "tool_call";
  }

  if (spanName?.toLowerCase().includes("tool_call")) {
    return "tool_call";
  }

  if (
    typeof attributes["graphql.operation.name"] === "string" ||
    spanName?.toLowerCase().includes("graphql")
  ) {
    return "graphql";
  }

  if (
    typeof attributes["db.system"] === "string" ||
    typeof attributes["db.statement"] === "string"
  ) {
    return "db";
  }

  if (
    typeof attributes["peer.service"] === "string" ||
    typeof attributes["server.address"] === "string" ||
    typeof attributes["http.host"] === "string"
  ) {
    return "service_call";
  }

  if (sessionId) {
    return "agent_session";
  }

  return "app";
}

function nanosToMilliseconds(value: string | number | undefined) {
  if (typeof value === "number") {
    return Math.round(value / 1_000_000);
  }

  if (typeof value === "string" && value.length > 0) {
    return Math.round(Number(value) / 1_000_000);
  }

  return 0;
}

function normalizeEnum(value: string | number | undefined, fallback: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
}

function bytesToHex(value: Buffer | Uint8Array | number[] | string | undefined) {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return Buffer.from(value).toString("hex");
}

function shouldRetainSpan(span: SpanRecord) {
  if (span.serviceName !== "codex-app-server") {
    return true;
  }

  if (span.category !== "app") {
    return true;
  }

  if (span.durationMs > 2) {
    return true;
  }

  return !CODEX_NOISE_SPANS.has(span.spanName);
}

const CODEX_NOISE_SPANS = new Set([
  "FramedRead::decode_frame",
  "Prioritize::queue_frame",
  "hpack::decode",
  "poll",
  "pop_frame",
  "reserve_capacity",
  "send_data"
]);
