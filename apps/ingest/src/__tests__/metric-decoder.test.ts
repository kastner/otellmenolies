import { describe, expect, it, vi } from "vitest";
import { extractMetricsFromExport } from "../metrics/metric-decoder.js";
import { createReceiverShape } from "../otel/receiver.js";

describe("metric export decoding", () => {
  it("extracts numeric datapoints from OTLP metrics payloads", () => {
    const request = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "gateway"
                }
              }
            ]
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  description: "HTTP latency",
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: 42.5,
                        attributes: [],
                        timeUnixNano: "42000000"
                      }
                    ]
                  },
                  name: "http.server.duration",
                  unit: "ms"
                }
              ]
            }
          ]
        }
      ]
    };

    const metrics = extractMetricsFromExport(request);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      dataType: "gauge",
      metricName: "http.server.duration",
      serviceName: "gateway",
      unit: "ms",
      value: 42.5
    });
  });

  it("passes metric datapoints into the configured ingest callback", async () => {
    const ingestMetricExport = vi.fn();
    const receiver = createReceiverShape({
      ingestMetricExport
    });

    await new Promise<void>((resolve, reject) => {
      receiver.metricsHandlers.Export(
        {
          request: {
            resourceMetrics: [
              {
                resource: {
                  attributes: []
                },
                scopeMetrics: [
                  {
                    metrics: [
                      {
                        gauge: {
                          dataPoints: [
                            {
                              asInt: 7,
                              attributes: [],
                              timeUnixNano: "1000"
                            }
                          ]
                        },
                        name: "tool.calls.total",
                        unit: "1"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        } as never,
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }

          expect(response).toMatchObject({
            partialSuccess: {}
          });
          resolve();
        }
      );
    });

    expect(ingestMetricExport).toHaveBeenCalledTimes(1);
    expect(ingestMetricExport.mock.calls[0]?.[0][0]).toMatchObject({
      metricName: "tool.calls.total",
      value: 7
    });
  });
});
