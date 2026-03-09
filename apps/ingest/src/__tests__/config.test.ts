import { describe, expect, it } from "bun:test";
import { createConfig } from "../config.js";

describe("createConfig", () => {
  it("uses the local default ports and paths", () => {
    const config = createConfig({});

    expect(config.grpcPort).toBe(14317);
    expect(config.httpPort).toBe(14318);
    expect(config.dataDir.endsWith("data")).toBe(true);
    expect(config.logsDir.endsWith("data/logs")).toBe(true);
    expect(config.protoDir.endsWith("packages/proto")).toBe(true);
  });
});
