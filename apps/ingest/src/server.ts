import grpc from "@grpc/grpc-js";
import Fastify from "fastify";
import { createBufferedIngest } from "./buffered-ingest.js";
import type { AppConfig } from "./config.js";
import { registerApiRoutes } from "./http/api.js";
import { createFileLogStore } from "./logs/file-log-store.js";
import { createMetricArchiveStore } from "./metrics/archive-store.js";
import { createMetricProfileAdvisor } from "./metrics/profile-advisor.js";
import { loadOtelDefinitions } from "./otel/load-protos.js";
import { createReceiverShape } from "./otel/receiver.js";
import { createSpanStore } from "./storage/span-store.js";
import { createSqliteDatabase } from "./storage/sqlite.js";

export type AppServer = {
  close: () => Promise<void>;
  start: () => Promise<void>;
};

export function createServer(config: AppConfig): AppServer {
  const definitions = loadOtelDefinitions(config);
  const database = createSqliteDatabase(config.databasePath);
  const logs = createFileLogStore({
    logsDir: config.logsDir
  });
  const spans = createSpanStore(database);
  const metrics = createMetricArchiveStore({
    advisor: createMetricProfileAdvisor({
      apiKey: config.openAiApiKey,
      model: config.openAiModel
    }),
    dataDir: config.dataDir
  });
  const ingestBuffer = createBufferedIngest({
    flushLogs: async (logExport) => {
      await logs.ingestLogs(logExport);
    },
    flushMetrics: async (metricExport) => {
      await metrics.ingestMetrics(metricExport);
    },
    flushSpans: (traceExport) => {
      spans.insertSpans(traceExport);
    }
  });
  const receiver = createReceiverShape({
    ingestLogExport: (logExport) => {
      ingestBuffer.enqueueLogs(logExport);
    },
    ingestMetricExport: (metricExport) => {
      ingestBuffer.enqueueMetrics(metricExport);
    },
    ingestTraceExport: (traceExport) => {
      ingestBuffer.enqueueSpans(traceExport);
    }
  });
  const grpcServer = new grpc.Server();
  const httpServer = Fastify();

  registerApiRoutes(httpServer, {
    metrics,
    spans
  });

  httpServer.get("/health", async () => ({
    grpcPort: config.grpcPort,
    httpPort: config.httpPort,
    ok: true
  }));

  grpcServer.addService(definitions.logsDefinition.service, receiver.logsHandlers);
  grpcServer.addService(definitions.traceDefinition.service, receiver.traceHandlers);
  grpcServer.addService(
    definitions.metricsDefinition.service,
    receiver.metricsHandlers
  );

  return {
    async close() {
      await ingestBuffer.close();
      await httpServer.close();
      await closeGrpcServer(grpcServer);
      database.close();
    },
    async start() {
      await httpServer.listen({
        host: config.host,
        port: config.httpPort
      });
      await bindGrpcServer(grpcServer, config.host, config.grpcPort);
    }
  };
}

function bindGrpcServer(server: grpc.Server, host: string, port: number) {
  return new Promise<number>((resolve, reject) => {
    server.bindAsync(
      `${host}:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          reject(error);
          return;
        }

        server.start();
        resolve(boundPort);
      }
    );
  });
}

function closeGrpcServer(server: grpc.Server) {
  return new Promise<void>((resolve, reject) => {
    server.tryShutdown((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
