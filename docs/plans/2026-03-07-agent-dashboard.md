# Agent Dashboard Expansion Implementation Plan

**Status:** Implemented on 2026-03-07.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent analytics timelines and tool-call drilldowns to the local dashboard, including conversation counts, token totals, wall-clock conversation duration, ranked tool usage, and tool-call argument inspection.

**Architecture:** The ingest daemon will enrich spans with a few derived agent fields and expose two dashboard-shaped agent analytics endpoints. The React dashboard will fetch those endpoints, render compact SVG charts, and show click-through tool-call details without adding a charting dependency.

**Tech Stack:** Bun, Turbo, TypeScript, Fastify, better-sqlite3, React, Vite, Vitest, Testing Library

---

### Task 1: Add failing ingest tests for derived agent analytics

**Files:**
- Modify: `apps/ingest/src/__tests__/span-store.test.ts`
- Modify: `apps/ingest/src/__tests__/api.test.ts`
- Modify: `apps/ingest/src/__tests__/trace-decoder.test.ts`

**Step 1: Write the failing test**

Add tests that expect:

- token fields to be extracted from supported attribute names
- Codex `call` payloads to yield `tool_call_id` and `tool_arguments`
- conversation overview buckets and tool rankings to be queryable
- tool drilldown responses to include argument payloads

**Step 2: Run test to verify it fails**

Run: `bun --filter @otellmenolies/ingest test`
Expected: new assertions fail because the derived fields and APIs do not exist yet

**Step 3: Write minimal implementation**

Add only the decoder, storage, and API code needed to satisfy the new expectations.

**Step 4: Run test to verify it passes**

Run: `bun --filter @otellmenolies/ingest test`
Expected: ingest tests pass

### Task 2: Implement ingest support for agent timelines and tool drilldown

**Files:**
- Modify: `apps/ingest/src/storage/sqlite.ts`
- Modify: `apps/ingest/src/storage/span-store.ts`
- Modify: `apps/ingest/src/http/api.ts`
- Modify: `apps/ingest/src/otel/trace-decoder.ts`

**Step 1: Write the failing test**

Covered by Task 1.

**Step 2: Run test to verify it fails**

Run: `bun --filter @otellmenolies/ingest test`
Expected: red state from the new agent analytics tests

**Step 3: Write minimal implementation**

Add nullable derived columns, populate them during ingest, and expose:

- `GET /api/agent/overview`
- `GET /api/agent/tools`

Use wall-clock conversation duration and best-effort argument extraction.

**Step 4: Run test to verify it passes**

Run: `bun --filter @otellmenolies/ingest test`
Expected: ingest tests pass

### Task 3: Add failing dashboard tests for agent analytics rendering

**Files:**
- Modify: `apps/dashboard/src/App.test.tsx`

**Step 1: Write the failing test**

Expect the dashboard to render:

- conversation timeline labels
- token charts
- duration chart
- ranked tool list
- a tool detail view showing arguments after user interaction

**Step 2: Run test to verify it fails**

Run: `bun --filter @otellmenolies/dashboard test`
Expected: render and interaction assertions fail

**Step 3: Write minimal implementation**

Only add the UI and fetch logic required by the test.

**Step 4: Run test to verify it passes**

Run: `bun --filter @otellmenolies/dashboard test`
Expected: dashboard tests pass

### Task 4: Implement the agent dashboard UI

**Files:**
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write the failing test**

Covered by Task 3.

**Step 2: Run test to verify it fails**

Run: `bun --filter @otellmenolies/dashboard test`
Expected: red state from new analytics assertions

**Step 3: Write minimal implementation**

Add compact SVG timeline components, ranked tool-call bars, selected-tool state, and a detail table or detail cards for tool instances and arguments.

**Step 4: Run test to verify it passes**

Run: `bun --filter @otellmenolies/dashboard test`
Expected: dashboard tests pass

### Task 5: Verify end to end with live local telemetry

**Files:**
- Modify: `README.md`
- Modify: `docs/2026-03-07-live-validation.md`

**Step 1: Write the failing test**

Define a runtime checklist:

- agent overview endpoint returns timeline buckets
- tool endpoint returns ranked tools
- selecting a tool yields tool-call instances with arguments when present
- dashboard loads the new sections without browser errors

**Step 2: Run verification commands**

Run:

- `bun --filter @otellmenolies/ingest test`
- `bun --filter @otellmenolies/dashboard test`
- `bun run test`
- `bun run build`
- `curl http://127.0.0.1:14318/api/agent/overview?range=3600`
- `curl http://127.0.0.1:14318/api/agent/tools?range=3600`

Expected: all pass and live responses contain agent analytics data

**Step 3: Document results**

Update the docs with what was validated live and any remaining gaps in source telemetry, especially around token availability.

## Completion notes

- Agent analytics timelines, ranked tool usage, and tool drilldowns were implemented.
- Live validation is recorded in `docs/2026-03-07-live-validation.md`.
- Subsequent local debugging added Codex noise pruning and non-overlapping dashboard polling so the dashboard stays usable under live Codex traffic.
