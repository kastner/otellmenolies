import { describe, expect, it, vi } from "vitest";
import { extractLogsFromExport } from "../logs/log-decoder.js";
import { createReceiverShape } from "../otel/receiver.js";

describe("log export decoding", () => {
  it("extracts OTLP log records into normalized entries", () => {
    const request = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "gateway"
                }
              },
              {
                key: "deployment.environment",
                value: {
                  stringValue: "dev"
                }
              }
            ]
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    {
                      key: "http.route",
                      value: {
                        stringValue: "/health"
                      }
                    }
                  ],
                  body: {
                    stringValue: "request complete"
                  },
                  observedTimeUnixNano: "1741392000000000000",
                  severityNumber: 9,
                  severityText: "INFO",
                  spanId: Buffer.from("0011223344556677", "hex"),
                  timeUnixNano: "1741391999000000000",
                  traceId: Buffer.from("00112233445566778899aabbccddeeff", "hex")
                }
              ],
              scope: {
                name: "http.logger",
                version: "1.2.3"
              }
            }
          ]
        }
      ]
    };

    const logs = extractLogsFromExport(request);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      attributes: {
        "http.route": "/health"
      },
      body: "request complete",
      observedTimestampMs: 1_741_392_000_000,
      resourceAttributes: {
        "deployment.environment": "dev",
        "service.name": "gateway"
      },
      scope: {
        name: "http.logger",
        version: "1.2.3"
      },
      serviceName: "gateway",
      severityNumber: 9,
      severityText: "INFO",
      spanId: "0011223344556677",
      timestampMs: 1_741_391_999_000,
      traceId: "00112233445566778899aabbccddeeff"
    });
  });

  it("passes decoded log entries into the configured ingest callback", async () => {
    const ingestLogExport = vi.fn();
    const receiver = createReceiverShape({
      ingestLogExport
    });

    await new Promise<void>((resolve, reject) => {
      receiver.logsHandlers.Export(
        {
          request: {
            resourceLogs: [
              {
                resource: {
                  attributes: []
                },
                scopeLogs: [
                  {
                    logRecords: [
                      {
                        body: {
                          stringValue: "tool completed"
                        },
                        severityText: "INFO",
                        timeUnixNano: "1000000"
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

    expect(ingestLogExport).toHaveBeenCalledTimes(1);
    expect(ingestLogExport.mock.calls[0]?.[0][0]).toMatchObject({
      body: "tool completed",
      severityText: "INFO"
    });
  });
});
