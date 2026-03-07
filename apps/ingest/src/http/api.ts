import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SpanStore } from "../storage/span-store.js";
import type { createMetricArchiveStore } from "../metrics/archive-store.js";

const rangeQuerySchema = z.object({
  range: z.coerce.number().positive().default(3600)
});

const traceQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  range: z.coerce.number().positive().default(3600)
});

export function registerApiRoutes(
  app: FastifyInstance,
  dependencies: {
    metrics?: ReturnType<typeof createMetricArchiveStore>;
    spans: SpanStore;
  }
) {
  app.get("/api/overview", async (request) => {
    const query = rangeQuerySchema.parse(request.query);
    const range = resolveRange(query.range);

    return dependencies.spans.getOverview(range);
  });

  app.get("/api/sessions", async (request) => {
    const query = rangeQuerySchema.parse(request.query);
    const range = resolveRange(query.range);

    return {
      sessions: dependencies.spans.listSessions(range)
    };
  });

  app.get("/api/traces", async (request) => {
    const query = traceQuerySchema.parse(request.query);
    const range = resolveRange(query.range);

    return {
      traces: dependencies.spans.getRecentTraces(range, query.limit)
    };
  });

  app.get("/api/traces/:traceId", async (request) => {
    const params = z
      .object({
        traceId: z.string().min(1)
      })
      .parse(request.params);

    return {
      spans: dependencies.spans.getTrace(params.traceId)
    };
  });

  app.get("/api/metrics/catalog", async () => ({
    metrics: dependencies.metrics ? await dependencies.metrics.getMetricCatalog() : []
  }));

  app.get("/api/metrics/series", async (request) => {
    const query = z
      .object({
        name: z.string().min(1),
        range: z.coerce.number().positive().default(3600)
      })
      .parse(request.query);

    if (!dependencies.metrics) {
      return {
        metricName: query.name,
        points: [],
        profile: null
      };
    }

    return dependencies.metrics.getSeries({
      endTimeMs: Date.now(),
      metricName: query.name,
      startTimeMs: Date.now() - query.range * 1_000
    });
  });
}

function resolveRange(rangeSeconds: number) {
  const endTimeMs = Date.now();
  const startTimeMs = endTimeMs - rangeSeconds * 1_000;

  return {
    endTimeMs,
    startTimeMs
  };
}
