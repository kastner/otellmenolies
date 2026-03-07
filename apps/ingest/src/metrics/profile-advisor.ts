import OpenAI from "openai";
import { z } from "zod";

const archiveSchema = z.object({
  points: z.coerce.number().int().positive().max(100_000),
  resolutionSeconds: z.coerce.number().int().positive().max(86_400)
});

const responseSchema = z.object({
  aggregation: z.enum(["avg", "last", "max", "sum"]),
  archives: z.array(archiveSchema).min(1).max(4),
  reasoning: z.string().min(1).max(400)
});

export type MetricDescriptor = {
  dataType: string;
  description?: string;
  metricName: string;
  unit?: string;
};

export type MetricProfile = z.infer<typeof responseSchema> & {
  source: "ai" | "heuristic";
};

type OpenAiClientShape = {
  responses: {
    create: (input: Record<string, unknown>) => Promise<{ output_text?: string }>;
  };
};

export function createMetricProfileAdvisor(options: {
  apiKey?: string;
  client?: OpenAiClientShape;
  model?: string;
}) {
  const model = options.model ?? "gpt-5.4";
  const client =
    options.client ??
    (options.apiKey
      ? (new OpenAI({
          apiKey: options.apiKey
        }) as unknown as OpenAiClientShape)
      : undefined);

  return {
    async decideProfile(metric: MetricDescriptor): Promise<MetricProfile> {
      if (!client) {
        return heuristicProfile(metric);
      }

      try {
        const response = await client.responses.create({
          input: [
            {
              content: [
                {
                  text:
                    "You choose retention profiles for time-series metrics. Return JSON only with keys aggregation, archives, reasoning.",
                  type: "input_text"
                },
                {
                  text: JSON.stringify(metric),
                  type: "input_text"
                }
              ],
              role: "user"
            }
          ],
          model,
          reasoning: {
            effort: "low"
          },
          text: {
            format: {
              type: "json_object"
            }
          }
        });
        const parsed = responseSchema.parse(
          normalizeResponseShape(JSON.parse(response.output_text ?? "{}"))
        );

        return {
          ...parsed,
          source: "ai"
        };
      } catch {
        return heuristicProfile(metric);
      }
    }
  };
}

function normalizeResponseShape(raw: Record<string, unknown>) {
  const aggregationMap: Record<string, MetricProfile["aggregation"]> = {
    average: "avg",
    avg: "avg",
    last: "last",
    latest: "last",
    max: "max",
    maximum: "max",
    sum: "sum",
    total: "sum"
  };

  return {
    aggregation:
      typeof raw.aggregation === "string"
        ? aggregationMap[raw.aggregation.toLowerCase()] ?? raw.aggregation
        : raw.aggregation,
    archives: Array.isArray(raw.archives)
      ? raw.archives.map((archive) => {
          if (typeof archive === "string") {
            const [precision, retention] = archive.split(":");
            const resolutionSeconds = durationStringToSeconds(precision);

            return {
              points: derivePointsFromRetention(resolutionSeconds, retention),
              resolutionSeconds
            };
          }

          const typedArchive = archive as Record<string, unknown>;
          const resolutionSeconds =
            typedArchive.resolutionSeconds ??
            typedArchive.secondsPerPoint ??
            durationStringToSeconds(
              typeof typedArchive.precision === "string"
                ? typedArchive.precision
                : undefined
            );
          const points =
            typedArchive.points ??
            derivePointsFromRetention(
              resolutionSeconds,
              typeof typedArchive.retention === "string"
                ? typedArchive.retention
                : undefined
            );

          return {
            points,
            resolutionSeconds
          };
        })
      : raw.archives,
    reasoning: raw.reasoning
  };
}

function derivePointsFromRetention(
  resolutionSeconds: unknown,
  retention: string | undefined
) {
  if (typeof resolutionSeconds !== "number" || !retention) {
    return undefined;
  }

  const retentionSeconds = durationStringToSeconds(retention);

  if (!retentionSeconds) {
    return undefined;
  }

  return Math.max(1, Math.round(retentionSeconds / resolutionSeconds));
}

function durationStringToSeconds(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^(\d+)(s|m|h|d|y)$/i);

  if (!match) {
    return undefined;
  }

  const [, amountText, unitText] = match;
  const amount = Number(amountText);
  const unit = (unitText ?? "").toLowerCase();

  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 60 * 60 * 24;
    case "y":
      return amount * 60 * 60 * 24 * 365;
  }
}

function heuristicProfile(metric: MetricDescriptor): MetricProfile {
  const lowerName = metric.metricName.toLowerCase();

  if (
    lowerName.includes("duration") ||
    lowerName.includes("latency") ||
    lowerName.includes("time")
  ) {
    return {
      aggregation: "avg",
      archives: [
        { points: 720, resolutionSeconds: 10 },
        { points: 1440, resolutionSeconds: 60 },
        { points: 2016, resolutionSeconds: 300 }
      ],
      reasoning: "Latency metrics benefit from short high-resolution windows plus longer rollups.",
      source: "heuristic"
    };
  }

  if (
    lowerName.includes("count") ||
    lowerName.includes("total") ||
    lowerName.includes("requests") ||
    lowerName.includes("calls") ||
    lowerName.includes("errors")
  ) {
    return {
      aggregation: "sum",
      archives: [
        { points: 720, resolutionSeconds: 10 },
        { points: 1440, resolutionSeconds: 60 },
        { points: 2880, resolutionSeconds: 900 }
      ],
      reasoning: "Counter-like metrics should aggregate by sum and retain coarse history longer.",
      source: "heuristic"
    };
  }

  if (
    lowerName.includes("memory") ||
    lowerName.includes("cpu") ||
    lowerName.includes("heap") ||
    lowerName.includes("rss")
  ) {
    return {
      aggregation: "last",
      archives: [
        { points: 720, resolutionSeconds: 10 },
        { points: 1440, resolutionSeconds: 60 },
        { points: 1440, resolutionSeconds: 300 }
      ],
      reasoning: "Resource metrics are best represented by recent sampled values and moderate retention.",
      source: "heuristic"
    };
  }

  return {
    aggregation: metric.dataType === "sum" ? "sum" : "avg",
    archives: [
      { points: 720, resolutionSeconds: 10 },
      { points: 1440, resolutionSeconds: 60 },
      { points: 1440, resolutionSeconds: 300 }
    ],
    reasoning: "Default profile balances short-term visibility with simple longer-term rollups.",
    source: "heuristic"
  };
}
