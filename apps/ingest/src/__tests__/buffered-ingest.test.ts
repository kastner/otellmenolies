import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { createBufferedIngest } from "../buffered-ingest.js";

describe("buffered ingest", () => {
  it("defers writes off the request path", async () => {
    const flushSpans = vi.fn();
    const flushMetrics = vi.fn().mockResolvedValue(undefined);
    const flushLogs = vi.fn().mockResolvedValue(undefined);
    const buffer = createBufferedIngest({
      flushLogs,
      flushMetrics,
      flushSpans,
      maxLogBatchSize: 100,
      maxMetricBatchSize: 100,
      maxSpanBatchSize: 100
    });

    buffer.enqueueMetrics([
      {
        attributes: {},
        dataType: "gauge",
        metricName: "http.server.duration",
        serviceName: "gateway",
        timestampMs: 1,
        value: 1
      }
    ]);
    buffer.enqueueSpans([
      {
        attributes: {},
        category: "app",
        durationMs: 10,
        kind: "SPAN_KIND_INTERNAL",
        resourceAttributes: {},
        serviceName: "gateway",
        spanId: "span-1",
        spanName: "GET /health",
        startTimeMs: 1,
        statusCode: "STATUS_CODE_UNSET",
        traceId: "trace-1"
      }
    ]);
    buffer.enqueueLogs([
      {
        attributes: {},
        body: "request complete",
        resourceAttributes: {},
        scope: {},
        serviceName: "gateway",
        severityText: "INFO",
        timestampMs: 1
      }
    ]);

    expect(flushSpans).not.toHaveBeenCalled();
    expect(flushMetrics).not.toHaveBeenCalled();
    expect(flushLogs).not.toHaveBeenCalled();

    await buffer.close();

    expect(flushSpans).toHaveBeenCalledTimes(1);
    expect(flushMetrics).toHaveBeenCalledTimes(1);
    expect(flushLogs).toHaveBeenCalledTimes(1);
  });

  it("flushes large queues in smaller batches", async () => {
    const flushSpans = vi.fn();
    const flushLogs = vi.fn().mockResolvedValue(undefined);
    const buffer = createBufferedIngest({
      flushLogs,
      flushMetrics: vi.fn().mockResolvedValue(undefined),
      flushSpans,
      maxLogBatchSize: 100,
      maxMetricBatchSize: 100,
      maxSpanBatchSize: 2
    });

    buffer.enqueueSpans([
      {
        attributes: {},
        category: "app",
        durationMs: 1,
        kind: "SPAN_KIND_INTERNAL",
        resourceAttributes: {},
        serviceName: "gateway",
        spanId: "span-1",
        spanName: "one",
        startTimeMs: 1,
        statusCode: "STATUS_CODE_UNSET",
        traceId: "trace-1"
      },
      {
        attributes: {},
        category: "app",
        durationMs: 1,
        kind: "SPAN_KIND_INTERNAL",
        resourceAttributes: {},
        serviceName: "gateway",
        spanId: "span-2",
        spanName: "two",
        startTimeMs: 2,
        statusCode: "STATUS_CODE_UNSET",
        traceId: "trace-1"
      },
      {
        attributes: {},
        category: "app",
        durationMs: 1,
        kind: "SPAN_KIND_INTERNAL",
        resourceAttributes: {},
        serviceName: "gateway",
        spanId: "span-3",
        spanName: "three",
        startTimeMs: 3,
        statusCode: "STATUS_CODE_UNSET",
        traceId: "trace-1"
      }
    ]);

    await buffer.close();

    expect(flushSpans).toHaveBeenCalledTimes(2);
    expect(flushSpans.mock.calls[0]?.[0]).toHaveLength(2);
    expect(flushSpans.mock.calls[1]?.[0]).toHaveLength(1);
  });

  it("flushes log batches separately from spans and metrics", async () => {
    const flushLogs = vi.fn().mockResolvedValue(undefined);
    const buffer = createBufferedIngest({
      flushLogs,
      flushMetrics: vi.fn().mockResolvedValue(undefined),
      flushSpans: vi.fn(),
      maxLogBatchSize: 2,
      maxMetricBatchSize: 100,
      maxSpanBatchSize: 100
    });

    buffer.enqueueLogs([
      {
        attributes: {},
        body: "one",
        resourceAttributes: {},
        scope: {},
        serviceName: "gateway",
        timestampMs: 1
      },
      {
        attributes: {},
        body: "two",
        resourceAttributes: {},
        scope: {},
        serviceName: "gateway",
        timestampMs: 2
      },
      {
        attributes: {},
        body: "three",
        resourceAttributes: {},
        scope: {},
        serviceName: "gateway",
        timestampMs: 3
      }
    ]);

    await buffer.close();

    expect(flushLogs).toHaveBeenCalledTimes(2);
    expect(flushLogs.mock.calls[0]?.[0]).toHaveLength(2);
    expect(flushLogs.mock.calls[1]?.[0]).toHaveLength(1);
  });
});
