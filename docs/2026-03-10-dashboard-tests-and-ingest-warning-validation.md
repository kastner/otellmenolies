# Dashboard Tests And Ingest Warning Validation

Date: 2026-03-10

## Summary

- Updated the dashboard tests to match the current unified agent analytics contract and fetch pattern.
- Removed the deprecated `grpc.Server.start()` call after `bindAsync()` in the ingest server.

## Root causes

- `apps/dashboard/src/App.test.tsx` still mocked the older dashboard behavior:
  - it expected `6` initial fetches instead of `7`
  - it did not mock `/api/agent/unified?range=3600&bucket=300`
  - it asserted UI copy from the older agent analytics layout
- `apps/ingest/src/server.ts` still called `server.start()` after `bindAsync()`, which now emits a deprecation warning from `@grpc/grpc-js`.

## Verification

Commands run:

```bash
bun run --filter @otellmenolies/dashboard test
bun run --filter @otellmenolies/ingest test apps/ingest/src/__tests__/grpc-metrics-export.test.ts
bun run --filter @otellmenolies/dashboard lint
bun run --filter @otellmenolies/ingest lint
```

Observed results:

- `bun run --filter @otellmenolies/dashboard test`: passed, `2` tests passed
- `bun run --filter @otellmenolies/ingest test apps/ingest/src/__tests__/grpc-metrics-export.test.ts`: passed, `41` tests passed
- `bun run --filter @otellmenolies/dashboard lint`: exited `0`
- `bun run --filter @otellmenolies/ingest lint`: exited `0`

## Warning check

- The targeted ingest test run completed without the earlier `DeprecationWarning: Calling start() is no longer necessary. It can be safely omitted.`
