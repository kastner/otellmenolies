import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DATA_DIR: z.string().optional(),
  HOST: z.string().default("127.0.0.1"),
  HTTP_PORT: z.coerce.number().int().positive().default(14318),
  OPENAI_API_KEY: z.string().optional(),
  OTLP_GRPC_PORT: z.coerce.number().int().positive().default(14317),
  PROTO_DIR: z.string().optional()
});

export type AppConfig = {
  dataDir: string;
  databasePath: string;
  grpcPort: number;
  host: string;
  httpPort: number;
  openAiApiKey?: string;
  openAiModel: string;
  protoDir: string;
  rootDir: string;
};

export function createConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.parse(env);
  const rootDir = path.resolve(import.meta.dirname, "../../..");

  return {
    dataDir: path.resolve(rootDir, parsed.DATA_DIR ?? "data"),
    databasePath: path.resolve(rootDir, parsed.DATA_DIR ?? "data", "telemetry.sqlite"),
    grpcPort: parsed.OTLP_GRPC_PORT,
    host: parsed.HOST,
    httpPort: parsed.HTTP_PORT,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL?.trim() || "gpt-5.4",
    protoDir: path.resolve(rootDir, parsed.PROTO_DIR ?? "packages/proto"),
    rootDir
  };
}
