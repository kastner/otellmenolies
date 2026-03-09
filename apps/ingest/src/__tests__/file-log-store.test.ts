import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFileLogStore } from "../logs/file-log-store.js";

describe("file log store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `otellmenolies-log-store-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, {
      force: true,
      recursive: true
    });
  });

  it("appends JSONL entries into the UTC daily log file", async () => {
    const store = createFileLogStore({
      logsDir: tempDir
    });

    await store.ingestLogs([
      {
        attributes: {
          "http.route": "/health"
        },
        body: "first line",
        observedTimestampMs: 1_741_398_401_000,
        resourceAttributes: {
          "service.name": "gateway"
        },
        scope: {
          name: "http.logger"
        },
        serviceName: "gateway",
        severityNumber: 9,
        severityText: "INFO",
        timestampMs: 1_741_398_400_000
      },
      {
        attributes: {},
        body: {
          message: "second line"
        },
        resourceAttributes: {
          "service.name": "gateway"
        },
        scope: {},
        serviceName: "gateway",
        severityText: "WARN",
        timestampMs: 1_741_398_499_000
      }
    ]);

    const content = await fs.readFile(path.join(tempDir, "2025-03-08.jsonl"), "utf8");
    const lines = content.trim().split("\n").map((line) => JSON.parse(line));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      attributes: {
        "http.route": "/health"
      },
      body: "first line",
      observedTimestampMs: 1_741_398_401_000,
      serviceName: "gateway",
      severityText: "INFO",
      timestamp: "2025-03-08T01:46:40.000Z",
      timestampMs: 1_741_398_400_000
    });
    expect(lines[1]).toMatchObject({
      body: {
        message: "second line"
      },
      severityText: "WARN",
      timestamp: "2025-03-08T01:48:19.000Z"
    });
  });
});
