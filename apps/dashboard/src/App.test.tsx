import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not start a new refresh while the current dashboard load is still pending", async () => {
    vi.useFakeTimers();
    const pendingFetch = new Promise<Response>(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => pendingFetch);

    render(<App apiBaseUrl="" refreshIntervalMs={20} />);

    expect(fetchSpy).toHaveBeenCalledTimes(6);

    await vi.advanceTimersByTimeAsync(100);

    expect(fetchSpy).toHaveBeenCalledTimes(6);
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

      if (url.endsWith("/api/agent/overview?range=3600&bucket=300")) {
        return new Response(
          JSON.stringify({
            conversationTimeline: [
              { bucketStartMs: 1, value: 1 },
              { bucketStartMs: 2, value: 3 },
              { bucketStartMs: 3, value: 2 }
            ],
            conversations: [
              {
                conversationId: "sess-1",
                durationMs: 180000,
                firstSeenAt: 1,
                inputTokens: 3200,
                lastSeenAt: 2,
                outputTokens: 900,
                serviceName: "codex",
                toolCallCount: 2,
                toolNames: ["exec_command", "write_stdin"],
                traceCount: 1
              }
            ],
            durationTimeline: [
              { bucketStartMs: 1, value: 120000 },
              { bucketStartMs: 2, value: 180000 },
              { bucketStartMs: 3, value: 90000 }
            ],
            inputTokenTimeline: [
              { bucketStartMs: 1, value: 1100 },
              { bucketStartMs: 2, value: 2200 },
              { bucketStartMs: 3, value: 1700 }
            ],
            outputTokenTimeline: [
              { bucketStartMs: 1, value: 300 },
              { bucketStartMs: 2, value: 650 },
              { bucketStartMs: 3, value: 410 }
            ],
            summary: {
              conversationCount: 1,
              inputTokens: 3200,
              outputTokens: 900,
              toolCallCount: 2
            }
          })
        );
      }

      if (url.includes("/api/agent/tools?") && url.includes("range=3600") && url.includes("limit=12") && !url.includes("toolName=")) {
        return new Response(
          JSON.stringify({
            tools: [
              {
                avgDurationMs: 420,
                callCount: 8,
                lastCalledAt: 2,
                toolName: "exec_command"
              },
              {
                avgDurationMs: 85,
                callCount: 3,
                lastCalledAt: 2,
                toolName: "write_stdin"
              }
            ]
          })
        );
      }

      if (
        url.includes("/api/agent/tools?")
        && url.includes("range=3600")
        && url.includes("limit=12")
        && url.includes("toolName=exec_command")
      ) {
        return new Response(
          JSON.stringify({
            selectedTool: {
              calls: [
                {
                  arguments: '{\n  "cmd": "ls -la",\n  "workdir": "/tmp"\n}',
                  calledAt: 2,
                  conversationId: "sess-1",
                  durationMs: 420,
                  serviceName: "codex",
                  spanId: "span-1",
                  toolCallId: "call-1",
                  toolName: "exec_command",
                  traceId: "trace-1"
                }
              ],
              toolName: "exec_command"
            },
            tools: [
              {
                avgDurationMs: 420,
                callCount: 8,
                lastCalledAt: 2,
                toolName: "exec_command"
              },
              {
                avgDurationMs: 85,
                callCount: 3,
                lastCalledAt: 2,
                toolName: "write_stdin"
              }
            ]
          })
        );
      }

      throw new Error(`Unexpected url ${url}`);
    });

    render(<App apiBaseUrl="" refreshIntervalMs={60_000} />);

    await waitFor(() => {
      expect(screen.getAllByText("sess-1").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POST /graphql").length).toBeGreaterThan(0);
    expect(screen.getAllByText("sess-1").length).toBeGreaterThan(0);
    expect(screen.getByText("http.server.duration")).toBeInTheDocument();
    expect(screen.getAllByText("exec_command, write_stdin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conversation volume").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Input tokens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Output tokens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Average duration").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /exec_command/ })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /exec_command/ }));

    await waitFor(() => {
      expect(screen.getAllByText("Tool call details").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("call-1")).toBeInTheDocument();
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
  });
});
