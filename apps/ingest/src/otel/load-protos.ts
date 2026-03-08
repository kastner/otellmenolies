import path from "node:path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import type { AppConfig } from "../config.js";

const LOADER_OPTIONS: protoLoader.Options = {
  defaults: true,
  enums: String,
  keepCase: false,
  longs: String,
  oneofs: true
};

export type OtelDefinitions = {
  grpcObject: grpc.GrpcObject;
  logsDefinition: grpc.ServiceClientConstructor;
  logsServicePath: string;
  metricsDefinition: grpc.ServiceClientConstructor;
  metricsServicePath: string;
  packageDefinition: protoLoader.PackageDefinition;
  traceDefinition: grpc.ServiceClientConstructor;
  traceServicePath: string;
};

export function loadOtelDefinitions(config: AppConfig): OtelDefinitions {
  const includeDirs = [config.protoDir];
  const protoFiles = [
    path.join(
      config.protoDir,
      "opentelemetry/proto/collector/logs/v1/logs_service.proto"
    ),
    path.join(
      config.protoDir,
      "opentelemetry/proto/collector/metrics/v1/metrics_service.proto"
    ),
    path.join(
      config.protoDir,
      "opentelemetry/proto/collector/trace/v1/trace_service.proto"
    )
  ];
  const packageDefinition = protoLoader.loadSync(protoFiles, {
    ...LOADER_OPTIONS,
    includeDirs
  });
  const grpcObject = grpc.loadPackageDefinition(packageDefinition);
  const logsServicePath = "opentelemetry.proto.collector.logs.v1.LogsService";
  const traceServicePath =
    "opentelemetry.proto.collector.trace.v1.TraceService";
  const metricsServicePath =
    "opentelemetry.proto.collector.metrics.v1.MetricsService";
  const logsDefinition = getServiceDefinition(grpcObject, logsServicePath);
  const traceDefinition = getServiceDefinition(grpcObject, traceServicePath);
  const metricsDefinition = getServiceDefinition(grpcObject, metricsServicePath);

  return {
    grpcObject,
    logsDefinition,
    logsServicePath,
    metricsDefinition,
    metricsServicePath,
    packageDefinition,
    traceDefinition,
    traceServicePath
  };
}

function getServiceDefinition(
  grpcObject: grpc.GrpcObject,
  dotPath: string
): grpc.ServiceClientConstructor {
  const resolved = dotPath.split(".").reduce<grpc.GrpcObject | unknown>(
    (current, segment) => {
      if (!current || typeof current !== "object" || !(segment in current)) {
        throw new Error(`Missing gRPC object path: ${dotPath}`);
      }

      return (current as grpc.GrpcObject)[segment];
    },
    grpcObject
  );

  if (!resolved || typeof resolved !== "function" || !("service" in resolved)) {
    throw new Error(`Resolved path is not a gRPC service: ${dotPath}`);
  }

  return resolved as grpc.ServiceClientConstructor;
}
