# Bun Source Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop relying on generated `dist` JavaScript for local workspace execution and keep the monorepo source-first under Bun.

**Architecture:** Move workspace package resolution to TypeScript source files, run the ingest daemon with Bun instead of `tsx`, and remove TypeScript emit settings that create `dist` artifacts for ingest/shared. Keep explicit dashboard bundling intact for its production build while ensuring normal test and dev flows do not require generated JS.

**Tech Stack:** Bun workspaces, Turbo, TypeScript, Vitest, Vite

---

### Task 1: Lock the expected source-first runtime behavior with tests

**Files:**
- Create: `apps/ingest/src/__tests__/workspace-runtime-config.test.ts`

**Step 1: Write the failing test**

Add a Vitest file that reads repo config and asserts:
- `packages/shared/package.json` exports point at `./src/index.ts`
- `apps/ingest/package.json` uses `bun --watch src/index.ts` for `dev`
- `apps/ingest/package.json` does not compile TypeScript to `dist` for `build`
- `turbo.json` does not force tests to run `^build`

**Step 2: Run test to verify it fails**

Run: `bun --filter @otellmenolies/ingest test apps/ingest/src/__tests__/workspace-runtime-config.test.ts`

Expected: FAIL because the current config still points at `dist`, uses `tsx`, and makes tests depend on builds.

**Step 3: Commit**

No commit at this checkpoint.

### Task 2: Make the workspace source-first under Bun

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsconfig.json`
- Modify: `apps/ingest/package.json`
- Modify: `apps/ingest/tsconfig.json`
- Modify: `turbo.json`

**Step 1: Write minimal implementation**

Update config so that:
- shared exports resolve to `src/index.ts`
- ingest `dev` runs with Bun watch mode
- ingest/shared `build` scripts no longer emit `dist`
- ingest/shared TS config no longer references `dist` outputs
- Turbo tests stop depending on `^build`

**Step 2: Run targeted test to verify it passes**

Run: `bun --filter @otellmenolies/ingest test apps/ingest/src/__tests__/workspace-runtime-config.test.ts`

Expected: PASS

**Step 3: Commit**

Commit after verification if the workspace is otherwise clean for this change set.

### Task 3: Verify, clean generated artifacts, and document validation

**Files:**
- Modify: `README.md`
- Create: `docs/2026-03-08-bun-source-runtime-validation.md`

**Step 1: Update docs**

Clarify that local dev/test runs source-first under Bun and that explicit dashboard builds still emit a bundle.

**Step 2: Remove generated artifacts**

Delete generated `dist` folders created by prior runs:
- `apps/ingest/dist`
- `packages/shared/dist`
- `apps/dashboard/dist` if present from a previous bundle build

**Step 3: Run verification**

Run:
- `bun --filter @otellmenolies/ingest test apps/ingest/src/__tests__/workspace-runtime-config.test.ts`
- `bun run test`
- `bun run lint`

Optional sanity check:
- `bun --filter @otellmenolies/ingest run dev`

Expected:
- targeted config test passes
- workspace tests and lint pass without recreating ingest/shared `dist`

**Step 4: Record validation**

Write the command results and artifact cleanup outcome to `docs/2026-03-08-bun-source-runtime-validation.md`.
