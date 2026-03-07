# Local OTel Monorepo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Bun/Turbo monorepo that receives OTLP/gRPC telemetry on `localhost:14317`, stores traces/spans and metrics, and serves dashboards for service telemetry and agent sessions/tool calls.

**Architecture:** The system is split into an ingest daemon and a dashboard app. The ingest daemon handles OTLP/gRPC, writes spans to SQLite, writes metrics into circular archives, and exposes a small HTTP query API. The dashboard is a lightweight React app that consumes those APIs and renders two operator-focused views.

**Tech Stack:** Bun, Turbo, TypeScript, React, Vite, `@grpc/grpc-js`, `@grpc/proto-loader`, `better-sqlite3`, `zod`, `tsx`

---

### Task 1: Bootstrap monorepo and tooling

**Files:**
- Create: `package.json`
- Create: `bun.lock`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `apps/ingest/package.json`
- Create: `apps/dashboard/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`

**Step 1: Write the failing test**

Create a smoke command expectation for workspace scripts:

```text
bun run build
```

Expected initial failure:

```text
error: Script not found "build"
```

**Step 2: Run test to verify it fails**

Run: `bun run build`
Expected: failure because workspace scripts do not exist yet

**Step 3: Write minimal implementation**

Create the workspace manifests and root build/dev/test scripts.

**Step 4: Run test to verify it passes**

Run: `bun run build`
Expected: workspace build commands execute successfully

**Step 5: Commit**

```bash
git add .
git commit -m "chore: bootstrap bun turbo monorepo

Attribution: T3 Code harness with GPT-5.4 High."
```

### Task 2: Add shared OTLP contracts and ingest skeleton

**Files:**
- Create: `packages/proto/**`
- Create: `apps/ingest/src/config.ts`
- Create: `apps/ingest/src/server.ts`
- Create: `apps/ingest/src/otel/receiver.ts`
- Create: `apps/ingest/src/otel/load-protos.ts`
- Create: `apps/ingest/src/index.ts`
- Test: `apps/ingest/src/**/*.test.ts`

**Step 1: Write the failing test**

Add a configuration/module test that expects the ingest app to expose the OTLP gRPC and HTTP ports.

**Step 2: Run test to verify it fails**

Run: `bun run --filter @otellmenolies/ingest test`
Expected: missing modules or failing assertions

**Step 3: Write minimal implementation**

Vendor the official OTLP proto files, load them with generic tooling, and stand up a receiver skeleton.

**Step 4: Run test to verify it passes**

Run: `bun run --filter @otellmenolies/ingest test`
Expected: tests pass

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add otlp receiver skeleton

Attribution: T3 Code harness with GPT-5.4 High."
```

### Task 3: Implement trace/span persistence and query API

**Files:**
- Create: `apps/ingest/src/storage/sqlite.ts`
- Create: `apps/ingest/src/storage/span-store.ts`
- Create: `apps/ingest/src/http/api.ts`
- Modify: `apps/ingest/src/otel/receiver.ts`
- Test: `apps/ingest/src/storage/**/*.test.ts`

**Step 1: Write the failing test**

Add tests for ingesting spans, deriving service/operation metadata, and querying summaries.

**Step 2: Run test to verify it fails**

Run: `bun run --filter @otellmenolies/ingest test`
Expected: query or persistence failures

**Step 3: Write minimal implementation**

Persist spans into SQLite and expose the overview/session endpoints needed by the dashboard.

**Step 4: Run test to verify it passes**

Run: `bun run --filter @otellmenolies/ingest test`
Expected: tests pass

**Step 5: Commit**

```bash
git add .
git commit -m "feat: persist and query traces

Attribution: T3 Code harness with GPT-5.4 High."
```

### Task 4: Implement AI-guided metric retention and series query

**Files:**
- Create: `apps/ingest/src/metrics/profile-advisor.ts`
- Create: `apps/ingest/src/metrics/archive-store.ts`
- Modify: `apps/ingest/src/otel/receiver.ts`
- Modify: `apps/ingest/src/http/api.ts`
- Test: `apps/ingest/src/metrics/**/*.test.ts`

**Step 1: Write the failing test**

Add tests for first-seen metric profile selection, fallback heuristics, archive rollups, and range queries.

**Step 2: Run test to verify it fails**

Run: `bun run --filter @otellmenolies/ingest test`
Expected: archive/profile behavior missing

**Step 3: Write minimal implementation**

Add the profile advisor, on-disk circular archives, and series query endpoint.

**Step 4: Run test to verify it passes**

Run: `bun run --filter @otellmenolies/ingest test`
Expected: tests pass

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add metric archive retention

Attribution: T3 Code harness with GPT-5.4 High."
```

### Task 5: Build the dashboard app

**Files:**
- Create: `apps/dashboard/src/**`
- Create: `apps/dashboard/index.html`
- Create: `apps/dashboard/vite.config.ts`
- Create: `apps/dashboard/tsconfig.json`
- Test: `apps/dashboard/src/**/*.test.tsx`

**Step 1: Write the failing test**

Add tests for the overview and sessions views rendering fetched data.

**Step 2: Run test to verify it fails**

Run: `bun run --filter @otellmenolies/dashboard test`
Expected: missing components or fetch wiring

**Step 3: Write minimal implementation**

Create the dashboard app shell, tables, charts, and polling data hooks.

**Step 4: Run test to verify it passes**

Run: `bun run --filter @otellmenolies/dashboard test`
Expected: tests pass

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add local telemetry dashboards

Attribution: T3 Code harness with GPT-5.4 High."
```

### Task 6: Verify live OTLP ingestion end to end

**Files:**
- Modify: `README.md`
- Modify: `docs/**`

**Step 1: Write the failing test**

Define the runtime verification checklist:

- ingest daemon starts on `14317`
- dashboard loads data from ingest API
- Codex-generated telemetry appears in sessions/tool calls or traces

**Step 2: Run test to verify it fails**

Run the apps before live traffic exists or before ingestion is wired fully.
Expected: missing data or broken endpoints

**Step 3: Write minimal implementation**

Fix gaps found during the live run, then document the validated commands and observed behavior.

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test
bun run build
bun run dev:ingest
```

Then trigger local telemetry and query the API.

Expected: tests/build pass and API returns live records

**Step 5: Commit**

```bash
git add .
git commit -m "docs: record live verification

Attribution: T3 Code harness with GPT-5.4 High."
```

## Notes

- Document any implementation-time deviations in `docs/`.
- Keep comments mentioning the harness/model attributed as: `T3 Code harness with GPT-5.4 High`.
- Prefer vendored official OTLP protobufs over OpenTelemetry runtime libraries.
