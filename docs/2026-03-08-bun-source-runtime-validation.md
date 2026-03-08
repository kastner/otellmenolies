# 2026-03-08 Bun Source Runtime Validation

## Scope

Shift local workspace execution away from generated `dist` JavaScript and onto Bun source-first resolution for `apps/ingest` and `packages/shared`.

## Commands

### Targeted config regression

```bash
bun --filter @otellmenolies/ingest test src/__tests__/workspace-runtime-config.test.ts
```

Result:
- Pass
- Verified `packages/shared` exports `./src/index.ts`
- Verified `apps/ingest` runs `bun --watch src/index.ts`
- Verified `turbo.json` no longer makes tests depend on `^build`

### Workspace lint

```bash
bun run lint
```

Result:
- Pass
- `@otellmenolies/dashboard`, `@otellmenolies/ingest`, and `@otellmenolies/shared` all completed `tsc --noEmit`

### Workspace tests

```bash
bun run test
```

Result:
- Partial failure
- `@otellmenolies/ingest`: pass, 13 files / 39 tests
- `@otellmenolies/shared`: pass, no test files
- `@otellmenolies/dashboard`: fail, 2 tests in `src/App.test.tsx`
- Failure is caused by an unexpected `/api/agent/unified?range=3600&bucket=300` fetch path and missing `sess-1` content in the rendered dashboard
- This aligns with existing uncommitted dashboard/application work already present in the workspace rather than the Bun runtime config change

### Source import sanity check

```bash
cd apps/ingest
bun --eval 'const mod = await import("@otellmenolies/shared"); console.log(Object.keys(mod).sort().join(","));'
```

Result:
- Pass
- Output: `formatCount,formatDurationMs,formatTimestamp`

## Artifact cleanup

Removed stale generated directories:
- `apps/ingest/dist`
- `packages/shared/dist`
- `apps/dashboard/dist`

Follow-up note:
- An explicit future `bun run build` still recreates `apps/dashboard/dist` because the dashboard uses Vite bundling for production output.
