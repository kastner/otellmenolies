# otellmenolies

Local OTLP ingest and dashboards for service telemetry and agent sessions.

## What is here

- `apps/ingest`: OTLP/gRPC receiver on `127.0.0.1:14317` and HTTP API on `127.0.0.1:14318`
- `apps/dashboard`: Vite/React dashboard on `http://localhost:5173/` in default dev
- `packages/shared`: shared formatting helpers used by the dashboard, imported directly from TypeScript source in local Bun workflows
- `packages/proto`: vendored official OpenTelemetry protobuf definitions
- `docs/plans`: design and implementation records
- `docs`: live validation notes

## Storage model

- Traces and spans go to SQLite at `data/telemetry.sqlite`
- Metrics go to `data/metrics/<metric-name>/archive.json`
- Logs go to daily JSONL files at `data/logs/YYYY-MM-DD.jsonl`
- Metric retention is chosen on first sight with an OpenAI-backed advisor and falls back to heuristics when the advisor fails
- The metric archive format is a small ring-buffer style store inspired by Whisper/RRD, not a full TSDB

## Why it is split this way

- The ingest process stays small and local-first
- The dashboard only talks to the ingest HTTP API
- No Docker is required
- OpenTelemetry runtime libraries are avoided where practical; ingestion uses vendored protos with generic gRPC/protobuf tooling instead

## Run it

Install once:

```bash
bun install
```

Create an env file from the template:

```bash
cp .env.example .env
```

You can also copy it to one of Bun's other built-in env filenames:

```bash
cp .env.example .env.local
cp .env.example .env.development
```

Environment config:

- Bun automatically loads `.env`, `.env.$NODE_ENV`, and `.env.local` for `bun run ...`.
- Use `.env` for shared local defaults, `.env.$NODE_ENV` for environment-specific overrides, and `.env.local` for machine-specific overrides with the highest precedence.
- `OPENAI_API_KEY` enables AI-backed metric retention advice.
- `OPENAI_MODEL` overrides the default model (`gpt-5.4`).
- `DATA_DIR`, `HOST`, `HTTP_PORT`, `OTLP_GRPC_PORT`, and `PROTO_DIR` override local paths and ports.
- `LOGS_DIR` overrides the default OTLP log output directory (`data/logs`).

Start the ingest daemon:

```bash
bun run dev:ingest
```

The ingest daemon runs directly from `src/index.ts` under Bun watch mode; no local `dist` build is required.

Start the dashboard on the default Vite dev port:

```bash
bun run dev:dashboard
```

Or start both apps together:

```bash
bun run dev
```

Open:

- Dashboard: `http://localhost:5173/`
- Ingest health: `http://127.0.0.1:14318/health`

## Enable telemetry from agent clients

Start the ingest daemon first with `bun run dev:ingest` or `bun run dev`, then point your agent client at `http://localhost:14317`.

### Codex CLI and the Codex IDE extension in Cursor

OpenAI's Codex IDE extension is available in Cursor, and the local setup here uses the shared Codex config file at `~/.codex/config.toml`.

Add:

```toml
[otel]
enabled = true
environment = "local"
log_user_prompt = false

[otel.exporter.otlp-grpc]
endpoint = "http://localhost:14317"
tool_output_token_limit = 25000
```

Restart Codex or Cursor after updating the file.

### Claude Code

Launch Claude Code with OTEL env vars enabled:

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1 \
OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:14317' \
OTEL_METRICS_EXPORTER=otlp \
OTEL_LOGS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
OTEL_LOGS_EXPORT_INTERVAL=1000 \
OTEL_METRIC_EXPORT_INTERVAL=1000 \
claude
```

If you run Claude Code from the Cursor extension, set the same values in `claudeCode.environmentVariables` instead of only in your shell.

## Useful API routes

- `GET /health`
- `GET /api/overview?range=600`
- `GET /api/traces?limit=8&range=600`
- `GET /api/sessions?range=600`
- `GET /api/metrics/catalog`
- `GET /api/metrics/series?name=http.server.duration&range=600`

## Current behavior notes

- The ingest daemon accepts OTLP traces, metrics, and logs on `127.0.0.1:14317`, then serves the dashboard/query API on `127.0.0.1:14318`.
- Session and conversation grouping use standard attributes first: `gen_ai.session.id`, `session.id`, `conversation.id`, then `thread.id`.
- If an agent exporter omits an explicit session id, tool-bearing spans fall back to a synthetic conversation bucket based on service and time. This is the current Codex fallback path.
- Tool calls are inferred from common OTEL/GenAI attributes and from Codex `call` payloads, so both Codex and Claude-style exports show up in the agent views.
- Token counts are backfilled from common usage attributes into the unified `agent_events` table for dashboard rollups.
- OTLP logs are stored as daily JSONL files in `data/logs/YYYY-MM-DD.jsonl`, using event time when present and observed time when exporters send `timeUnixNano=0`.
- High-volume `codex-app-server` transport noise is filtered during ingest and pruned on startup so the dashboard stays responsive under live Codex traffic.
- First-seen metric retention still prefers the OpenAI advisor and falls back to heuristics when profile generation fails.

## Verification

Workspace verification:

```bash
bun run test
bun run build
```

`bun run test` and `bun run lint` stay source-first and should not create `dist` output for `apps/ingest` or `packages/shared`.
`bun run build` still produces the explicit Vite bundle for `apps/dashboard`.

Supporting notes:

- [docs/2026-03-07-live-validation.md](docs/2026-03-07-live-validation.md)
- [docs/2026-03-08-bun-env-docs-validation.md](docs/2026-03-08-bun-env-docs-validation.md)
- [docs/2026-03-08-otel-logs-validation.md](docs/2026-03-08-otel-logs-validation.md)
- [docs/2026-03-08-readme-github-validation.md](docs/2026-03-08-readme-github-validation.md)
- [docs/plans/2026-03-08-env-example-design.md](docs/plans/2026-03-08-env-example-design.md)
- [docs/plans/2026-03-08-env-example.md](docs/plans/2026-03-08-env-example.md)

## Attribution

Commit messages in this branch use: `Attribution: T3 Code harness with GPT-5.4 High.`
