export type LogRecord = {
  attributes: Record<string, unknown>;
  body?: unknown;
  observedTimeUnixNano?: string | number;
  observedTimestampMs?: number;
  resourceAttributes: Record<string, unknown>;
  scope: {
    name?: string;
    version?: string;
  };
  serviceName: string;
  severityNumber?: number;
  severityText?: string;
  spanId?: string;
  timeUnixNano?: string | number;
  timestampMs: number;
  traceId?: string;
};
