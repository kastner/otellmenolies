import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders service and agent telemetry from the ingest api", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/api/overview?range=3600")) {
        return new Response(
          JSON.stringify({
            edges: [
              {
                count: 12,
                fromService: "gateway",
                toService: "billing"
              }
            ],
            hotspots: [
              {
                avgDurationMs: 42,
                category: "graphql",
                operationName: "POST /graphql",
                p95DurationMs: 84,
                serviceName: "gateway",
                spanCount: 14
              }
            ],
            services: [
              {
                avgDurationMs: 33,
                operationCount: 9,
                serviceName: "gateway",
                spanCount: 22
              }
            ],
            summary: {
              sessionCount: 1,
              spanCount: 22,
              traceCount: 8
            }
          })
        );
      }

      if (url.endsWith("/api/traces?limit=8&range=3600")) {
        return new Response(
          JSON.stringify({
            traces: [
              {
                durationMs: 91,
                rootSpanName: "POST /graphql",
                serviceName: "gateway",
                spanCount: 4,
                traceId: "trace-1"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/sessions?range=3600")) {
        return new Response(
          JSON.stringify({
            sessions: [
              {
                firstSeenAt: 1,
                lastSeenAt: 2,
                serviceName: "codex",
                sessionId: "sess-1",
                toolCallCount: 2,
                toolNames: ["exec_command", "write_stdin"],
                traceCount: 1
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/metrics/catalog")) {
        return new Response(
          JSON.stringify({
            metrics: [
              {
                aggregation: "avg",
                metricName: "http.server.duration",
                serviceNames: ["gateway"],
                unit: "ms"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/metrics/series?name=http.server.duration&range=3600")) {
        return new Response(
          JSON.stringify({
            metricName: "http.server.duration",
            points: [
              { bucketStartMs: 1, count: 1, value: 21 },
              { bucketStartMs: 2, count: 1, value: 28 },
              { bucketStartMs: 3, count: 1, value: 18 }
            ],
            profile: {
              aggregation: "avg",
              archives: [
                {
                  points: 720,
                  resolutionSeconds: 10
                }
              ],
              reasoning: "Latency metric",
              source: "ai"
            },
            serviceNames: ["gateway"],
            unit: "ms"
          })
        );
      }

      throw new Error(`Unexpected url ${url}`);
    });

    render(<App apiBaseUrl="" refreshIntervalMs={60_000} />);

    await waitFor(() => {
      expect(screen.getByText("sess-1")).toBeInTheDocument();
    });

    expect(screen.getAllByText("gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POST /graphql").length).toBeGreaterThan(0);
    expect(screen.getByText("sess-1")).toBeInTheDocument();
    expect(screen.getByText("http.server.duration")).toBeInTheDocument();
    expect(screen.getByText("exec_command, write_stdin")).toBeInTheDocument();
  });
});
