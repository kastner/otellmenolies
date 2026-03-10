# gRPC Metric Batch Limit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow otellmenolies to accept large OTLP/gRPC metric exports from Codex without returning `RESOURCE_EXHAUSTED`.

**Architecture:** Reproduce the failure with an integration test that sends an OTLP metrics request larger than gRPC's default 4 MiB receive limit, then raise the ingest server's gRPC message size ceiling so the existing receiver path can accept the request. Validate with the targeted test and the ingest test suite, then record the outcome in `docs/`.

**Tech Stack:** Bun, TypeScript, `@grpc/grpc-js`, OTLP protobufs

---

### Task 1: Capture the failing transport case

**Files:**
- Create: `apps/ingest/src/__tests__/grpc-metrics-export.test.ts`

**Step 1: Write the failing test**

Add an integration test that:
- starts the ingest server on ephemeral localhost ports
- creates a real OTLP MetricsService gRPC client from the vendored proto definitions
- sends a deliberately large metric export request
- expects the export to succeed instead of returning `RESOURCE_EXHAUSTED`

**Step 2: Run test to verify it fails**

Run: `bun test apps/ingest/src/__tests__/grpc-metrics-export.test.ts`
Expected: FAIL with `RESOURCE_EXHAUSTED` and a `Received message larger than max (... vs 4194304)` detail

### Task 2: Raise the server-side gRPC receive limit

**Files:**
- Modify: `apps/ingest/src/server.ts`

**Step 1: Write minimal implementation**

Construct the gRPC server with explicit message-size options large enough for Codex metric batches while keeping the rest of the receiver flow unchanged.

**Step 2: Run targeted test to verify it passes**

Run: `bun test apps/ingest/src/__tests__/grpc-metrics-export.test.ts`
Expected: PASS

### Task 3: Verify and document

**Files:**
- Create: `docs/2026-03-10-grpc-metric-batch-limit-validation.md`

**Step 1: Run focused verification**

Run:
- `bun run --filter @otellmenolies/ingest test apps/ingest/src/__tests__/grpc-metrics-export.test.ts`
- `bun run --filter @otellmenolies/ingest test`

Expected: PASS

**Step 2: Record evidence**

Document the reproduced root cause, the fix, and the verification commands in `docs/2026-03-10-grpc-metric-batch-limit-validation.md`.

**Step 3: Commit**

```bash
git add apps/ingest/src/server.ts apps/ingest/src/__tests__/grpc-metrics-export.test.ts docs/plans/2026-03-10-grpc-metric-batch-limit.md docs/2026-03-10-grpc-metric-batch-limit-validation.md
git commit -m "fix: accept larger otlp grpc metric batches

Attribution: harness with GPT-5."
```
