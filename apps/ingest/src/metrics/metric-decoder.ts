import type { MetricPoint } from "./archive-store.js";

type OtlpAttribute = {
  key?: string;
  value?: Record<string, unknown>;
};

type OtlpMetric = {
  description?: string;
  gauge?: {
    dataPoints?: OtlpDataPoint[];
  };
  name?: string;
  sum?: {
    dataPoints?: OtlpDataPoint[];
  };
  unit?: string;
};

type OtlpDataPoint = {
  asDouble?: number;
  asInt?: number | string;
  attributes?: OtlpAttribute[];
  timeUnixNano?: string | number;
};

export function extractMetricsFromExport(request: {
  resourceMetrics?: Array<{
    resource?: {
      attributes?: OtlpAttribute[];
    };
    scopeMetrics?: Array<{
      metrics?: OtlpMetric[];
    }>;
  }>;
}): MetricPoint[] {
  const points: MetricPoint[] = [];

  for (const resourceMetric of request.resourceMetrics ?? []) {
    const resourceAttributes = attributeListToRecord(
      resourceMetric.resource?.attributes ?? []
    );
    const serviceName =
      typeof resourceAttributes["service.name"] === "string"
        ? (resourceAttributes["service.name"] as string)
        : "unknown-service";

    for (const scopeMetric of resourceMetric.scopeMetrics ?? []) {
      for (const metric of scopeMetric.metrics ?? []) {
        const metricType = metric.gauge ? "gauge" : metric.sum ? "sum" : undefined;
        const dataPoints = metric.gauge?.dataPoints ?? metric.sum?.dataPoints ?? [];

        if (!metricType || !metric.name) {
          continue;
        }

        for (const dataPoint of dataPoints) {
          const value =
            typeof dataPoint.asDouble === "number"
              ? dataPoint.asDouble
              : Number(dataPoint.asInt ?? 0);

          points.push({
            attributes: attributeListToRecord(dataPoint.attributes ?? []),
            dataType: metricType,
            description: metric.description,
            metricName: metric.name,
            serviceName,
            timestampMs: nanosToMilliseconds(dataPoint.timeUnixNano),
            unit: metric.unit,
            value
          });
        }
      }
    }
  }

  return points;
}

function attributeListToRecord(attributes: OtlpAttribute[]) {
  const record: Record<string, unknown> = {};

  for (const attribute of attributes) {
    if (!attribute.key || !attribute.value) {
      continue;
    }

    if ("stringValue" in attribute.value) {
      record[attribute.key] = attribute.value.stringValue;
      continue;
    }

    if ("boolValue" in attribute.value) {
      record[attribute.key] = attribute.value.boolValue;
      continue;
    }

    if ("doubleValue" in attribute.value) {
      record[attribute.key] = attribute.value.doubleValue;
      continue;
    }

    if ("intValue" in attribute.value) {
      record[attribute.key] = Number(attribute.value.intValue);
    }
  }

  return record;
}

function nanosToMilliseconds(value: string | number | undefined) {
  if (typeof value === "number") {
    return Math.round(value / 1_000_000);
  }

  if (typeof value === "string" && value.length > 0) {
    return Math.round(Number(value) / 1_000_000);
  }

  return Date.now();
}
