# otellmenolies

Local OTLP ingest and dashboards for service telemetry and agent sessions.

## What is here

- `apps/ingest`: OTLP/gRPC receiver on `127.0.0.1:14317` and HTTP API on `127.0.0.1:14318`
- `apps/dashboard`: Vite/React dashboard on `http://localhost:5173/` in default dev
- `packages/shared`: shared formatting helpers used by the dashboard
- `packages/proto`: vendored official OpenTelemetry protobuf definitions
- `docs/plans`: design and implementation records
- `docs`: live validation notes

## Storage model

- Traces and spans go to SQLite at `data/telemetry.sqlite`
- Metrics go to `data/metrics/<metric-name>/archive.json`
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

Start the ingest daemon:

```bash
set -a
source .env
set +a
bun run dev:ingest
```

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

## Useful API routes

- `GET /health`
- `GET /api/overview?range=600`
- `GET /api/traces?limit=8&range=600`
- `GET /api/sessions?range=600`
- `GET /api/metrics/catalog`
- `GET /api/metrics/series?name=http.server.duration&range=600`

## Current behavior notes

- Codex traffic is accepted directly on `14317` and shows up as `codex-app-server`
- Tool calls are detected from Codex `tool_name` attributes
- Sessions for Codex are synthesized by service plus time bucket because the live spans seen here do not include an explicit session id
- High-volume low-signal Codex transport spans are filtered to keep the dashboard responsive
- Existing Codex transport noise is pruned on startup so a previously overloaded local database can recover after restart
- The OpenAI metric advisor is verified and working at module level; the live daemon still intentionally falls back to heuristics when first-seen profile generation fails under load

## Verification

Workspace verification:

```bash
bun run test
bun run build
```

Machine-specific live verification is recorded in [docs/2026-03-07-live-validation.md](/Users/erik.kastner/workspace/meta/otellmenolies/.worktrees/feature-otel-local/docs/2026-03-07-live-validation.md).

## Attribution

Commit messages in this branch use: `Attribution: T3 Code harness with GPT-5.4 High.`
