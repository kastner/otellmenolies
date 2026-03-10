import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import grpc from "@grpc/grpc-js";
import { describe, expect, it } from "bun:test";
import { createConfig } from "../config.js";
import { loadOtelDefinitions } from "../otel/load-protos.js";
import { createServer } from "../server.js";

type MetricsClient = {
  Export: (
    request: Record<string, unknown>,
    callback: (
      error: grpc.ServiceError | null,
      response?: Record<string, unknown>
    ) => void
  ) => void;
  close: () => void;
};

type MetricsClientConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials
) => MetricsClient;

describe("gRPC OTLP metrics export", () => {
  it(
    "accepts metric exports that exceed the default gRPC receive limit",
    async () => {
      const tempDir = path.join(
        os.tmpdir(),
        `otellmenolies-grpc-metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`
      );
      const grpcPort = await getAvailablePort();
      const httpPort = await getAvailablePort();
      const config = createConfig({
        DATA_DIR: tempDir,
        HOST: "127.0.0.1",
        HTTP_PORT: String(httpPort),
        OTLP_GRPC_PORT: String(grpcPort)
      });
      const server = createServer(config);

      await server.start();

      try {
        const definitions = loadOtelDefinitions(config);
        const Client = definitions.metricsDefinition as unknown as MetricsClientConstructor;
        const client = new Client(
          `${config.host}:${config.grpcPort}`,
          grpc.credentials.createInsecure()
        );

        const response = await new Promise<Record<string, unknown>>(
          (resolve, reject) => {
            client.Export(createLargeMetricExportRequest(), (error, payload) => {
              client.close();

              if (error) {
                reject(error);
                return;
              }

              resolve(payload ?? {});
            });
          }
        );

        expect(response).toMatchObject({
          partialSuccess: {}
        });
      } finally {
        await server.close();
        await fs.rm(tempDir, {
          force: true,
          recursive: true
        });
      }
    },
    15_000
  );
});

function createLargeMetricExportRequest() {
  const sharedAttributes = [
    {
      key: "service.instance.id",
      value: {
        stringValue: "instance-abcdefghijklmnopqrstuvwxyz-0123456789"
      }
    },
    {
      key: "gen_ai.operation.name",
      value: {
        stringValue: "tool_execution_metric_payload_debugging"
      }
    },
    {
      key: "thread.id",
      value: {
        stringValue: "019cd55e-0d22-79c2-86e1-02f35adbb442"
      }
    },
    {
      key: "workspace",
      value: {
        stringValue: "/Users/erik.kastner/workspace/meta/otellmenolies"
      }
    }
  ];

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: {
                stringValue: "codex"
              }
            }
          ]
        },
        scopeMetrics: [
          {
            metrics: [
              {
                gauge: {
                  dataPoints: Array.from({ length: 10_000 }, (_, index) => ({
                    asDouble: index / 10,
                    attributes: [
                      ...sharedAttributes,
                      {
                        key: "idx",
                        value: {
                          intValue: String(index)
                        }
                      },
                      {
                        key: "tool_name",
                        value: {
                          stringValue: `exec_command_${index.toString().padStart(6, "0")}`
                        }
                      },
                      {
                        key: "summary",
                        value: {
                          stringValue: "x".repeat(200)
                        }
                      }
                    ],
                    timeUnixNano: String((Date.now() + index) * 1_000_000)
                  }))
                },
                name: "codex.metric.heavy",
                unit: "1"
              }
            ]
          }
        ]
      }
    ]
  };
}

async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an ephemeral port."));
        return;
      }

      const { port } = address;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}
