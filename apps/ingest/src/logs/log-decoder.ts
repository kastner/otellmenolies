import type { LogRecord } from "./types.js";

type OtlpAttribute = {
  key?: string;
  value?: Record<string, unknown> | null;
};

type OtlpLogRecord = {
  attributes?: OtlpAttribute[];
  body?: Record<string, unknown> | null;
  observedTimeUnixNano?: string | number;
  severityNumber?: number | string;
  severityText?: string;
  spanId?: Buffer | Uint8Array | number[] | string;
  timeUnixNano?: string | number;
  traceId?: Buffer | Uint8Array | number[] | string;
};

export function extractLogsFromExport(request: {
  resourceLogs?: Array<{
    resource?: {
      attributes?: OtlpAttribute[];
    };
    scopeLogs?: Array<{
      logRecords?: OtlpLogRecord[];
      scope?: {
        name?: string;
        version?: string;
      };
    }>;
  }>;
}): LogRecord[] {
  const records: LogRecord[] = [];

  for (const resourceLog of request.resourceLogs ?? []) {
    const resourceAttributes = attributeListToRecord(
      resourceLog.resource?.attributes ?? []
    );
    const serviceName = resolveServiceName(resourceAttributes);

    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const logRecord of scopeLog.logRecords ?? []) {
        const observedTimestampMs =
          logRecord.observedTimeUnixNano === undefined
            ? undefined
            : maybeNanosToMilliseconds(logRecord.observedTimeUnixNano);

        records.push({
          attributes: attributeListToRecord(logRecord.attributes ?? []),
          body:
            logRecord.body === undefined
              ? undefined
              : anyValueToPrimitive(logRecord.body),
          observedTimeUnixNano: logRecord.observedTimeUnixNano,
          observedTimestampMs,
          resourceAttributes,
          scope: {
            name: scopeLog.scope?.name,
            version: scopeLog.scope?.version
          },
          serviceName,
          severityNumber: maybeNumber(logRecord.severityNumber),
          severityText: logRecord.severityText,
          spanId: bytesToHex(logRecord.spanId),
          timeUnixNano: logRecord.timeUnixNano,
          timestampMs: resolveTimestampMs(
            logRecord.timeUnixNano,
            logRecord.observedTimeUnixNano
          ),
          traceId: bytesToHex(logRecord.traceId)
        });
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

function anyValueToPrimitive(value: Record<string, unknown> | null | undefined): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

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

function resolveTimestampMs(
  timeUnixNano?: string | number,
  observedTimeUnixNano?: string | number
) {
  const eventTimestampMs = maybeNanosToMilliseconds(timeUnixNano);

  if (eventTimestampMs !== undefined && eventTimestampMs > 0) {
    return eventTimestampMs;
  }

  const observedTimestampMs = maybeNanosToMilliseconds(observedTimeUnixNano);

  if (observedTimestampMs !== undefined && observedTimestampMs > 0) {
    return observedTimestampMs;
  }

  return Date.now();
}

function maybeNanosToMilliseconds(value: string | number | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value / 1_000_000) : undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.round(parsed / 1_000_000);
}

function maybeNumber(value: number | string | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return undefined;
}

function bytesToHex(value?: Buffer | Uint8Array | number[] | string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return Buffer.from(value).toString("hex");
}
