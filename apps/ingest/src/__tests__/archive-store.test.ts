import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMetricArchiveStore } from "../metrics/archive-store.js";

describe("metric archive store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `otellmenolies-metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, {
      force: true,
      recursive: true
    });
  });

  it("creates a cached profile and keeps time buckets in fixed-size archives", async () => {
    const store = createMetricArchiveStore({
      advisor: {
        decideProfile: vi.fn().mockResolvedValue({
          aggregation: "avg",
          archives: [
            {
              points: 3,
              resolutionSeconds: 10
            }
          ],
          reasoning: "latency metric",
          source: "ai"
        })
      },
      dataDir: tempDir
    });

    await store.ingestMetrics([
      {
        attributes: {},
        dataType: "gauge",
        description: "HTTP latency",
        metricName: "http.server.duration",
        serviceName: "gateway",
        timestampMs: 1_000,
        unit: "ms",
        value: 10
      },
      {
        attributes: {},
        dataType: "gauge",
        description: "HTTP latency",
        metricName: "http.server.duration",
        serviceName: "gateway",
        timestampMs: 11_000,
        unit: "ms",
        value: 30
      },
      {
        attributes: {},
        dataType: "gauge",
        description: "HTTP latency",
        metricName: "http.server.duration",
        serviceName: "gateway",
        timestampMs: 21_000,
        unit: "ms",
        value: 50
      },
      {
        attributes: {},
        dataType: "gauge",
        description: "HTTP latency",
        metricName: "http.server.duration",
        serviceName: "gateway",
        timestampMs: 31_000,
        unit: "ms",
        value: 70
      }
    ]);

    const series = await store.getSeries({
      endTimeMs: 40_000,
      metricName: "http.server.duration",
      startTimeMs: 0
    });

    expect(series.profile.aggregation).toBe("avg");
    expect(series.points).toHaveLength(3);
    expect(series.points.map((point) => point.value)).toEqual([30, 50, 70]);
  });
});
