import fs from "node:fs/promises";
import path from "node:path";
import type { MetricDescriptor, MetricProfile } from "./profile-advisor.js";

export type MetricPoint = {
  attributes: Record<string, unknown>;
  dataType: string;
  description?: string;
  metricName: string;
  serviceName: string;
  timestampMs: number;
  unit?: string;
  value: number;
};

type ArchiveSlot = {
  bucketStartMs: number;
  count: number;
  max: number;
  min: number;
  sum: number;
  value: number;
};

type ArchiveDefinition = MetricProfile["archives"][number];

type ArchiveState = ArchiveDefinition & {
  slots: Array<ArchiveSlot | null>;
};

type MetricState = {
  metricName: string;
  profile: MetricProfile;
  serviceNames: string[];
  unit?: string;
};

type MetricArchiveDocument = {
  archives: ArchiveState[];
  metric: MetricState;
};

export function createMetricArchiveStore(options: {
  advisor: {
    decideProfile: (metric: MetricDescriptor) => Promise<MetricProfile>;
  };
  dataDir: string;
}) {
  return {
    async getMetricCatalog() {
      const metricsDir = path.join(options.dataDir, "metrics");

      try {
        const entries = await fs.readdir(metricsDir, {
          withFileTypes: true
        });
        const catalog = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const document = await readMetricDocument(
            path.join(metricsDir, entry.name, "archive.json")
          );

          catalog.push({
            aggregation: document.metric.profile.aggregation,
            metricName: document.metric.metricName,
            serviceNames: document.metric.serviceNames,
            unit: document.metric.unit
          });
        }

        return catalog.sort((left, right) =>
          left.metricName.localeCompare(right.metricName)
        );
      } catch {
        return [];
      }
    },
    async getSeries(input: {
      endTimeMs: number;
      metricName: string;
      startTimeMs: number;
    }) {
      const document = await readMetricDocument(metricFilePath(options.dataDir, input.metricName));
      const rangeMs = input.endTimeMs - input.startTimeMs;
      const archive =
        [...document.archives]
          .sort((left, right) => left.resolutionSeconds - right.resolutionSeconds)
          .find(
            (candidate) =>
              candidate.resolutionSeconds * 1_000 * candidate.points >= rangeMs
          ) ?? document.archives[0];

      if (!archive) {
        throw new Error(`Metric ${input.metricName} has no configured archives.`);
      }

      const points = archive.slots
        .filter((slot): slot is ArchiveSlot => Boolean(slot))
        .filter(
          (slot) =>
            slot.bucketStartMs >= input.startTimeMs &&
            slot.bucketStartMs <= input.endTimeMs
        )
        .sort((left, right) => left.bucketStartMs - right.bucketStartMs)
        .map((slot) => ({
          bucketStartMs: slot.bucketStartMs,
          count: slot.count,
          value: aggregateValue(slot, document.metric.profile.aggregation)
        }));

      return {
        metricName: document.metric.metricName,
        points,
        profile: document.metric.profile,
        serviceNames: document.metric.serviceNames,
        unit: document.metric.unit
      };
    },
    async ingestMetrics(points: MetricPoint[]) {
      for (const point of points) {
        const filePath = metricFilePath(options.dataDir, point.metricName);
        const existing = await maybeReadMetricDocument(filePath);
        const profile =
          existing?.metric.profile ??
          (await options.advisor.decideProfile({
            dataType: point.dataType,
            description: point.description,
            metricName: point.metricName,
            unit: point.unit
          }));
        const document =
          existing ??
          createMetricDocument({
            metricName: point.metricName,
            profile,
            unit: point.unit
          });

        if (!document.metric.serviceNames.includes(point.serviceName)) {
          document.metric.serviceNames.push(point.serviceName);
          document.metric.serviceNames.sort();
        }

        for (const archive of document.archives) {
          const bucketStartMs =
            Math.floor(point.timestampMs / (archive.resolutionSeconds * 1_000)) *
            archive.resolutionSeconds *
            1_000;
          const slotIndex =
            Math.floor(bucketStartMs / (archive.resolutionSeconds * 1_000)) %
            archive.points;
          const previous = archive.slots[slotIndex];

          if (!previous || previous.bucketStartMs !== bucketStartMs) {
            archive.slots[slotIndex] = {
              bucketStartMs,
              count: 1,
              max: point.value,
              min: point.value,
              sum: point.value,
              value: point.value
            };
            continue;
          }

          previous.count += 1;
          previous.max = Math.max(previous.max, point.value);
          previous.min = Math.min(previous.min, point.value);
          previous.sum += point.value;
          previous.value = point.value;
        }

        await fs.mkdir(path.dirname(filePath), {
          recursive: true
        });
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
      }
    }
  };
}

function createMetricDocument(input: {
  metricName: string;
  profile: MetricProfile;
  unit?: string;
}): MetricArchiveDocument {
  return {
    archives: input.profile.archives.map((archive) => ({
      ...archive,
      slots: Array.from({
        length: archive.points
      }, () => null)
    })),
    metric: {
      metricName: input.metricName,
      profile: input.profile,
      serviceNames: [],
      unit: input.unit
    }
  };
}

async function maybeReadMetricDocument(filePath: string) {
  try {
    return await readMetricDocument(filePath);
  } catch {
    return undefined;
  }
}

async function readMetricDocument(filePath: string): Promise<MetricArchiveDocument> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as MetricArchiveDocument;
}

function aggregateValue(slot: ArchiveSlot, aggregation: MetricProfile["aggregation"]) {
  switch (aggregation) {
    case "avg":
      return Number((slot.sum / slot.count).toFixed(2));
    case "last":
      return slot.value;
    case "max":
      return slot.max;
    case "sum":
      return Number(slot.sum.toFixed(2));
  }
}

function metricFilePath(dataDir: string, metricName: string) {
  return path.join(dataDir, "metrics", safeMetricName(metricName), "archive.json");
}

function safeMetricName(metricName: string) {
  return metricName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}
