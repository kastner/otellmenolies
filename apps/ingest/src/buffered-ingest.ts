import { setTimeout as delay } from "node:timers/promises";
import type { LogRecord } from "./logs/types.js";
import type { MetricPoint } from "./metrics/archive-store.js";
import type { SpanRecord } from "./storage/span-store.js";

export function createBufferedIngest(options: {
  flushLogs: (logs: LogRecord[]) => Promise<void>;
  flushMetrics: (points: MetricPoint[]) => Promise<void>;
  flushSpans: (spans: SpanRecord[]) => void;
  maxLogBatchSize?: number;
  maxMetricBatchSize?: number;
  maxSpanBatchSize?: number;
}) {
  const logQueue: LogRecord[] = [];
  const metricQueue: MetricPoint[] = [];
  const spanQueue: SpanRecord[] = [];
  const maxLogBatchSize = options.maxLogBatchSize ?? 200;
  const maxMetricBatchSize = options.maxMetricBatchSize ?? 200;
  const maxSpanBatchSize = options.maxSpanBatchSize ?? 1_000;
  let draining = false;
  let scheduled = false;

  return {
    close: async () => {
      while (
        scheduled ||
        draining ||
        logQueue.length > 0 ||
        metricQueue.length > 0 ||
        spanQueue.length > 0
      ) {
        await flushOnce();
        await delay(1);
      }
    },
    enqueueLogs(logs: LogRecord[]) {
      logQueue.push(...logs);
      schedule();
    },
    enqueueMetrics(points: MetricPoint[]) {
      metricQueue.push(...points);
      schedule();
    },
    enqueueSpans(spans: SpanRecord[]) {
      spanQueue.push(...spans);
      schedule();
    }
  };

  function schedule() {
    if (scheduled) {
      return;
    }

    scheduled = true;
    setTimeout(() => {
      void flushOnce();
    }, 0);
  }

  async function flushOnce() {
    if (draining) {
      return;
    }

    draining = true;
    scheduled = false;

    try {
      while (spanQueue.length > 0) {
        options.flushSpans(spanQueue.splice(0, maxSpanBatchSize));
        await delay(0);
      }

      while (logQueue.length > 0) {
        await options.flushLogs(logQueue.splice(0, maxLogBatchSize));
        await delay(0);
      }

      while (metricQueue.length > 0) {
        await options.flushMetrics(metricQueue.splice(0, maxMetricBatchSize));
        await delay(0);
      }
      } finally {
        draining = false;

      if (spanQueue.length > 0 || logQueue.length > 0 || metricQueue.length > 0) {
        schedule();
      }
    }
  }
}
