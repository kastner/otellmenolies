import fs from "node:fs/promises";
import path from "node:path";
import type { LogRecord } from "./types.js";

export type FileLogStore = {
  ingestLogs: (logs: LogRecord[]) => Promise<void>;
};

export function createFileLogStore(options: {
  logsDir: string;
}): FileLogStore {
  return {
    async ingestLogs(logs) {
      const batches = new Map<string, string[]>();

      for (const log of logs) {
        const filePath = path.join(options.logsDir, `${utcDay(log.timestampMs)}.jsonl`);
        const line = JSON.stringify({
          ...log,
          timestamp: new Date(log.timestampMs).toISOString()
        });
        const existing = batches.get(filePath) ?? [];

        existing.push(line);
        batches.set(filePath, existing);
      }

      for (const [filePath, lines] of batches) {
        await fs.mkdir(path.dirname(filePath), {
          recursive: true
        });
        await fs.appendFile(filePath, `${lines.join("\n")}\n`);
      }
    }
  };
}

function utcDay(timestampMs: number) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}
