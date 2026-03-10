# gRPC Metric Batch Limit Validation

Date: 2026-03-10

## Root cause

- Reproduced the Codex metrics failure locally with a real OTLP MetricsService export.
- The failing status was:

```text
8 RESOURCE_EXHAUSTED: Received message larger than max (5459942 vs 4194304)
```

- This came from the ingest server still using gRPC's default 4 MiB receive limit for inbound unary requests.

## Fix

- Raised the ingest gRPC server receive ceiling to `32 MiB` in `apps/ingest/src/server.ts`.
- Added `apps/ingest/src/__tests__/grpc-metrics-export.test.ts` to exercise a large attribute-heavy OTLP metric batch against the real server.
- Set the new integration test timeout to `15000ms` so it remains stable under the filtered/full ingest suite.

## Verification

Commands run:

```bash
bun test apps/ingest/src/__tests__/grpc-metrics-export.test.ts
bun run --filter @otellmenolies/ingest test apps/ingest/src/__tests__/grpc-metrics-export.test.ts
bun run --filter @otellmenolies/ingest test
bun run --filter @otellmenolies/ingest lint
```

Observed results:

- `bun test apps/ingest/src/__tests__/grpc-metrics-export.test.ts`: passed, `1 pass`, `0 fail`
- `bun run --filter @otellmenolies/ingest test apps/ingest/src/__tests__/grpc-metrics-export.test.ts`: passed, `41 pass`, `0 fail`
- `bun run --filter @otellmenolies/ingest test`: passed, `41 pass`, `0 fail`
- `bun run --filter @otellmenolies/ingest lint`: exited `0`

## Notes

- The ingest tests still emit the pre-existing `@grpc/grpc-js` deprecation warning about `server.start()`. That warning is unchanged by this fix.
