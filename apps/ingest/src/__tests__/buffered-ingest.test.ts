import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { createBufferedIngest } from "../buffered-ingest.js";

describe("buffered ingest", () => {
  it("defers writes off the request path", async () => {
    const flushSpans = vi.fn();
    const flushMetrics = vi.fn().mockResolvedValue(undefined);
    const buffer = createBufferedIngest({
      flushMetrics,
      flushSpans,
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

    expect(flushSpans).not.toHaveBeenCalled();
    expect(flushMetrics).not.toHaveBeenCalled();

    await delay(5);

    expect(flushSpans).toHaveBeenCalledTimes(1);
    expect(flushMetrics).toHaveBeenCalledTimes(1);
    await buffer.close();
  });

  it("flushes large queues in smaller batches", async () => {
    const flushSpans = vi.fn();
    const buffer = createBufferedIngest({
      flushMetrics: vi.fn().mockResolvedValue(undefined),
      flushSpans,
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
});
