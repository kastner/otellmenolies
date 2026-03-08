import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { SpanStore } from "../storage/span-store.js";
import type { createMetricArchiveStore } from "../metrics/archive-store.js";

const allowedOriginPattern = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;
const allowedMethods = "GET, POST, OPTIONS";

const rangeQuerySchema = z.object({
  range: z.coerce.number().positive().default(3600)
});

const traceQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  range: z.coerce.number().positive().default(3600)
});

const bucketedRangeQuerySchema = z.object({
  bucket: z.coerce.number().int().positive().max(3600).default(300),
  range: z.coerce.number().positive().default(3600)
});

const toolUsageQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(12),
  range: z.coerce.number().positive().default(3600),
  toolName: z.string().min(1).optional()
});

export function registerApiRoutes(
  app: FastifyInstance,
  dependencies: {
    metrics?: ReturnType<typeof createMetricArchiveStore>;
    spans: SpanStore;
  }
) {
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (origin && allowedOriginPattern.test(origin)) {
      setCorsHeaders(request.headers["access-control-request-headers"], origin, reply);
    }

    if (request.method === "OPTIONS") {
      if (origin && allowedOriginPattern.test(origin)) {
        return reply.code(204).send();
      }

      return reply.code(403).send({
        error: "Origin not allowed"
      });
    }
  });

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

  app.get("/api/agent/overview", async (request) => {
    const query = bucketedRangeQuerySchema.parse(request.query);
    const range = resolveRange(query.range);

    return dependencies.spans.getAgentOverview({
      ...range,
      bucketSizeSeconds: query.bucket
    });
  });

  app.get("/api/agent/tools", async (request) => {
    const query = toolUsageQuerySchema.parse(request.query);
    const range = resolveRange(query.range);

    return dependencies.spans.getToolUsage({
      ...range,
      limit: query.limit,
      toolName: query.toolName
    });
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

function setCorsHeaders(
  requestedHeaders: string | undefined,
  origin: string,
  reply: FastifyReply
) {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", allowedMethods);
  reply.header(
    "Access-Control-Allow-Headers",
    requestedHeaders || "content-type, authorization"
  );
  reply.header("Access-Control-Max-Age", "600");
  reply.header("Vary", "Origin");
}
