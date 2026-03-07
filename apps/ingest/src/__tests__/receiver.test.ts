import { describe, expect, it } from "vitest";
import { createConfig } from "../config.js";
import { loadOtelDefinitions } from "../otel/load-protos.js";
import { createReceiverShape } from "../otel/receiver.js";

describe("loadOtelDefinitions", () => {
  it("loads trace and metrics collector services from vendored protos", () => {
    const config = createConfig({});
    const definitions = loadOtelDefinitions(config);

    expect(definitions.traceServicePath).toBe(
      "opentelemetry.proto.collector.trace.v1.TraceService"
    );
    expect(definitions.metricsServicePath).toBe(
      "opentelemetry.proto.collector.metrics.v1.MetricsService"
    );
  });

  it("creates handler shapes for both ingest services", () => {
    const shape = createReceiverShape();

    expect(shape.traceHandlers.Export).toBeTypeOf("function");
    expect(shape.metricsHandlers.Export).toBeTypeOf("function");
  });
});
