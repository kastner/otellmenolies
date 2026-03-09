# Bun SQLite Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the ingest app's Bun-incompatible `better-sqlite3` usage with Bun's built-in SQLite support so `bun run dev` starts cleanly again.

**Architecture:** Keep the existing storage call sites stable by introducing a thin compatibility layer in `apps/ingest/src/storage/sqlite.ts`. That layer will wrap `bun:sqlite` statements so current `prepare().run/get/all()` calls and plain named-parameter objects continue to work without rewriting every query.

**Tech Stack:** Bun, Turbo, TypeScript, Vitest, `bun:sqlite`

---

### Task 1: Capture the failing Bun compatibility case

**Files:**
- Modify: `apps/ingest/src/__tests__/sqlite.test.ts`
- Test: `apps/ingest/src/__tests__/sqlite.test.ts`

**Step 1: Write the failing test**

Add a regression test that creates a database with `createSqliteDatabase`, inserts a row through a statement using plain named parameters like `@spanId`, and verifies the row is stored correctly under Bun.

**Step 2: Run test to verify it fails**

Run: `bun test apps/ingest/src/__tests__/sqlite.test.ts`
Expected: FAIL because the current implementation imports `better-sqlite3`, which Bun cannot load.

**Step 3: Commit**

```bash
git add apps/ingest/src/__tests__/sqlite.test.ts
git commit -m "test: capture bun sqlite compatibility regression"
```

### Task 2: Replace the driver with a Bun-compatible adapter

**Files:**
- Modify: `apps/ingest/package.json`
- Modify: `apps/ingest/src/storage/sqlite.ts`
- Test: `apps/ingest/src/__tests__/sqlite.test.ts`

**Step 1: Write minimal implementation**

Swap the driver import to `bun:sqlite`, add a wrapper for `prepare().run/get/all()` that rewrites plain object keys to Bun-compatible named bindings, and replace `pragma()` calls with equivalent `exec()` statements where needed.

**Step 2: Run focused tests**

Run: `bun test apps/ingest/src/__tests__/sqlite.test.ts apps/ingest/src/__tests__/span-store.test.ts apps/ingest/src/__tests__/api.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/ingest/package.json apps/ingest/src/storage/sqlite.ts apps/ingest/src/__tests__/sqlite.test.ts
git commit -m "fix: migrate ingest sqlite to bun runtime"
```

### Task 3: Verify the full dev workflow and document validation

**Files:**
- Create: `docs/2026-03-09-bun-sqlite-validation.md`

**Step 1: Run end-to-end verification**

Run: `bun run dev`
Expected: ingest and dashboard dev servers both start without the `better-sqlite3` error.

**Step 2: Record validation evidence**

Save the commands run, observed output, and any remaining caveats in `docs/2026-03-09-bun-sqlite-validation.md`.

**Step 3: Commit**

```bash
git add docs/2026-03-09-bun-sqlite-validation.md
git commit -m "docs: record bun sqlite validation"
```
