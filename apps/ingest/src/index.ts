import { createConfig } from "./config.js";
import { createServer } from "./server.js";

const config = createConfig(process.env);
const server = createServer(config);

await server.start();

console.log(
  `otellmenolies ingest listening on grpc ${config.grpcPort} and http ${config.httpPort}`
);
