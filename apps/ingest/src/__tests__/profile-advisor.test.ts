import { describe, expect, it, vi } from "bun:test";
import { createMetricProfileAdvisor } from "../metrics/profile-advisor.js";

describe("metric profile advisor", () => {
  it("accepts structured AI suggestions", async () => {
    const advisor = createMetricProfileAdvisor({
      client: {
        responses: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify({
              aggregation: "avg",
              archives: [
                {
                  points: 720,
                  resolutionSeconds: 10
                },
                {
                  points: 1440,
                  resolutionSeconds: 60
                }
              ],
              reasoning: "Latency metric"
            })
          })
        }
      } as never,
      model: "gpt-5.4"
    });

    const profile = await advisor.decideProfile({
      dataType: "gauge",
      description: "Request latency",
      metricName: "http.server.duration",
      unit: "ms"
    });

    expect(profile.source).toBe("ai");
    expect(profile.aggregation).toBe("avg");
    expect(profile.archives[0]).toMatchObject({
      points: 720,
      resolutionSeconds: 10
    });
  });

  it("falls back to heuristics when AI is unavailable", async () => {
    const advisor = createMetricProfileAdvisor({
      client: {
        responses: {
          create: vi.fn().mockRejectedValue(new Error("network"))
        }
      } as never,
      model: "gpt-5.4"
    });

    const profile = await advisor.decideProfile({
      dataType: "sum",
      metricName: "tool.calls.total",
      unit: "1"
    });

    expect(profile.source).toBe("heuristic");
    expect(profile.aggregation).toBe("sum");
    expect(profile.archives).toHaveLength(3);
  });

  it("normalizes valid AI responses that use alias field names", async () => {
    const advisor = createMetricProfileAdvisor({
      client: {
        responses: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify({
              aggregation: "average",
              archives: [
                {
                  points: 60480,
                  secondsPerPoint: 10
                }
              ],
              reasoning: "Alias response"
            })
          })
        }
      } as never,
      model: "gpt-5.4"
    });

    const profile = await advisor.decideProfile({
      dataType: "gauge",
      metricName: "http.server.duration",
      unit: "ms"
    });

    expect(profile.source).toBe("ai");
    expect(profile.aggregation).toBe("avg");
    expect(profile.archives[0]).toMatchObject({
      points: 60480,
      resolutionSeconds: 10
    });
  });

  it("normalizes precision and retention archive formats", async () => {
    const advisor = createMetricProfileAdvisor({
      client: {
        responses: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify({
              aggregation: "average",
              archives: [
                {
                  precision: "10s",
                  retention: "7d"
                }
              ],
              reasoning: "Duration metric"
            })
          })
        }
      } as never,
      model: "gpt-5.4"
    });

    const profile = await advisor.decideProfile({
      dataType: "gauge",
      metricName: "gateway.request.latency.ai",
      unit: "ms"
    });

    expect(profile.source).toBe("ai");
    expect(profile.archives[0]).toMatchObject({
      points: 60480,
      resolutionSeconds: 10
    });
  });

  it("normalizes compact archive strings", async () => {
    const advisor = createMetricProfileAdvisor({
      client: {
        responses: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify({
              aggregation: "average",
              archives: ["10s:7d", "1m:30d"],
              reasoning: "Compact response"
            })
          })
        }
      } as never,
      model: "gpt-5.4"
    });

    const profile = await advisor.decideProfile({
      dataType: "gauge",
      metricName: "gateway.request.latency.ai",
      unit: "ms"
    });

    expect(profile.source).toBe("ai");
    expect(profile.archives[0]).toMatchObject({
      points: 60480,
      resolutionSeconds: 10
    });
    expect(profile.archives[1]).toMatchObject({
      points: 43200,
      resolutionSeconds: 60
    });
  });
});
