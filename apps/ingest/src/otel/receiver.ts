import grpc from "@grpc/grpc-js";
import { extractMetricsFromExport } from "../metrics/metric-decoder.js";
import { extractSpansFromTraceExport } from "./trace-decoder.js";

type UnaryHandler = grpc.handleUnaryCall<Record<string, unknown>, Record<string, unknown>>;

export type ReceiverShape = {
  metricsHandlers: {
    Export: UnaryHandler;
  };
  traceHandlers: {
    Export: UnaryHandler;
  };
};

type ReceiverDependencies = {
  ingestMetricExport?: (
    points: ReturnType<typeof extractMetricsFromExport>
  ) => Promise<void> | void;
  ingestTraceExport?: (spans: ReturnType<typeof extractSpansFromTraceExport>) => Promise<void> | void;
};

export function createReceiverShape(
  dependencies: ReceiverDependencies = {}
): ReceiverShape {
  return {
    metricsHandlers: {
      Export: async (call, callback) => {
        const points = extractMetricsFromExport(call.request);

        await dependencies.ingestMetricExport?.(points);
        callback(null, {
          partialSuccess: {}
        });
      }
    },
    traceHandlers: {
      Export: async (call, callback) => {
        const spans = extractSpansFromTraceExport(call.request);

        await dependencies.ingestTraceExport?.(spans);
        callback(null, {
          partialSuccess: {}
        });
      }
    }
  };
}
