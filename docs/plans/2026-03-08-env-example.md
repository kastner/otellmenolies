# Env Example Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a root `.env.example` and update the README so local setup uses Bun's built-in env file loading with clear copy instructions.

**Architecture:** Keep the change documentation-only except for the new template file. The template mirrors the env vars read by `apps/ingest/src/config.ts`, while the README explains which Bun env filename to copy it to and how precedence works.

**Tech Stack:** Bun, Turbo, TypeScript, Markdown

---

### Task 1: Add the env template

**Files:**
- Create: `.env.example`
- Reference: `apps/ingest/src/config.ts`

**Step 1: Define the required variables**

Use the env vars currently read by the ingest app:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DATA_DIR`
- `HOST`
- `HTTP_PORT`
- `OTLP_GRPC_PORT`
- `PROTO_DIR`

**Step 2: Write the template**

Add safe defaults for local development and leave the API key blank.

**Step 3: Verify the file is trackable**

Run:

```bash
git check-ignore -v .env.example
```

Expected: no output, because `.env.example` must not be ignored.

### Task 2: Update startup docs

**Files:**
- Modify: `README.md`

**Step 1: Add copy instructions**

Document copying `.env.example` to one of:

- `.env`
- `.env.local`
- `.env.$NODE_ENV`

**Step 2: Explain precedence**

Document Bun's automatic load order in concise terms and describe when each filename is appropriate.

**Step 3: Keep the env var list aligned**

Retain a short explanation of what each supported env var controls.

### Task 3: Record validation

**Files:**
- Modify: `docs/2026-03-08-bun-env-docs-validation.md`

**Step 1: Record the repo checks**

Document the searches and file checks used to confirm the change.

**Step 2: Run verification**

Run:

```bash
git diff --check -- .env.example README.md docs/2026-03-08-bun-env-docs-validation.md docs/plans/2026-03-08-env-example-design.md docs/plans/2026-03-08-env-example.md
git check-ignore -v .env.example
```

Expected:

- `git diff --check` returns clean
- `git check-ignore -v .env.example` returns no output
