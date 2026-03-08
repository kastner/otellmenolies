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
        const startTimeMs = nanosToMilliseconds(span.startTimeUnixNano);
        const conversationId = resolveConversationId(
          sessionId,
          serviceName,
          startTimeMs,
          toolName
        );
        const category = resolveCategory(attributes, span.name, toolName, sessionId);
        const endTimeMs = nanosToMilliseconds(span.endTimeUnixNano);
        const inputTokens = resolveTokenCount(attributes, INPUT_TOKEN_KEYS);
        const outputTokens = resolveTokenCount(attributes, OUTPUT_TOKEN_KEYS);
        const toolCallId = resolveToolCallId(attributes);
        const toolArguments = resolveToolArguments(attributes);

        const record: SpanRecord = {
          attributes,
          category,
          conversationId,
          durationMs: Math.max(0, endTimeMs - startTimeMs),
          inputTokens,
          kind: normalizeEnum(span.kind, "SPAN_KIND_INTERNAL"),
          outputTokens,
          parentSpanId: bytesToHex(span.parentSpanId),
          resourceAttributes,
          serviceName,
          sessionId,
          spanId: bytesToHex(span.spanId) ?? `missing-span-id-${records.length}`,
          spanName: span.name ?? "unnamed span",
          startTimeMs,
          statusCode: normalizeEnum(span.status?.code, "STATUS_CODE_UNSET"),
          toolArguments,
          toolCallId,
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

function resolveConversationId(
  sessionId: string | undefined,
  serviceName: string,
  startTimeMs: number,
  toolName: string | undefined
) {
  if (sessionId) {
    return sessionId;
  }

  if (toolName) {
    return `${serviceName}@${Math.floor(startTimeMs / 1_800_000)}`;
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

  const parsed = parseCodexCallPayload(attributes["call"]);

  if (parsed?.toolName) {
    return parsed.toolName;
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

function resolveTokenCount(
  attributes: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = attributes[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function resolveToolCallId(attributes: Record<string, unknown>) {
  for (const key of TOOL_CALL_ID_KEYS) {
    const value = attributes[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const parsed = parseCodexCallPayload(attributes["call"]);
  return parsed?.toolCallId;
}

function resolveToolArguments(attributes: Record<string, unknown>) {
  for (const key of TOOL_ARGUMENT_KEYS) {
    const value = attributes[key];

    if (value === undefined || value === null) {
      continue;
    }

    return normalizeArgumentPayload(value);
  }

  const parsed = parseCodexCallPayload(attributes["call"]);
  return parsed?.toolArguments;
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

  if (span.category === "app") {
    return false;
  }

  if (
    span.category === "tool_call" &&
    CODEX_DUPLICATE_TOOL_SPANS.has(span.spanName) &&
    !span.toolArguments &&
    !span.toolCallId
  ) {
    return false;
  }

  if (span.category !== "app") {
    return (
      span.toolName !== undefined ||
      span.toolArguments !== undefined ||
      span.toolCallId !== undefined
    );
  }

  return false;
}

function normalizeArgumentPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    return prettyPrintJsonIfPossible(value);
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return JSON.stringify(value, null, 2);
  }

  return value === undefined ? undefined : String(value);
}

function prettyPrintJsonIfPossible(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function parseCodexCallPayload(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const toolCallId = value.match(/call_id:\s*"([^"]+)"/)?.[1];
  const toolName = value.match(/tool_name:\s*"([^"]+)"/)?.[1];
  const encodedArguments = value.match(/arguments:\s*"((?:\\.|[^"])*)"/)?.[1];
  const rawArguments = encodedArguments
    ? decodeEscapedString(encodedArguments)
    : undefined;

  return {
    toolArguments: rawArguments ? prettyPrintJsonIfPossible(rawArguments) : undefined,
    toolCallId,
    toolName
  };
}

function decodeEscapedString(value: string) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

const CODEX_DUPLICATE_TOOL_SPANS = new Set([
  "handle_responses"
]);

const INPUT_TOKEN_KEYS = [
  "gen_ai.usage.input_tokens",
  "usage.input_tokens",
  "input_tokens",
  "prompt_tokens"
];

const OUTPUT_TOKEN_KEYS = [
  "gen_ai.usage.output_tokens",
  "usage.output_tokens",
  "output_tokens",
  "completion_tokens"
];

const TOOL_CALL_ID_KEYS = [
  "tool.call.id",
  "tool_call_id",
  "call_id",
  "gen_ai.tool.call.id",
  "openai.call_id"
];

const TOOL_ARGUMENT_KEYS = [
  "tool.arguments",
  "tool_arguments",
  "arguments",
  "gen_ai.tool.arguments",
  "openai.tool.arguments",
  "input"
];
