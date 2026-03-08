# OTLP Log Ingest Validation

**Date:** 2026-03-08

## Scope

Validate the new OTLP log receiver path, file-backed JSONL persistence, and config/docs updates.

## Targeted TDD Checks

Command:

```bash
bun run --filter @otellmenolies/ingest test -- config receiver log-decoder file-log-store buffered-ingest
```

Result:

- PASS
- verified the intended red failures first for missing `logsDir`, missing LogsService wiring, missing `enqueueLogs`, and missing decoder/store modules
- verified green after adding config, decoder, buffer, and file-store support

## Package Verification

Command:

```bash
bun run --filter @otellmenolies/ingest test
bun run --filter @otellmenolies/ingest build
```

Result:

- PASS
- `bun run --filter @otellmenolies/ingest test`: `12` test files passed, `34/34` tests passed
- `bun run --filter @otellmenolies/ingest build`: exited `0`

## Workspace Verification

Command:

```bash
bun run test
bun run build
```

Result:

- PASS
- `bun run test`: Turbo completed successfully across `@otellmenolies/shared`, `@otellmenolies/dashboard`, and `@otellmenolies/ingest`
- `bun run build`: Turbo completed successfully across all workspace packages

## Notes

- OTLP logs now default to `data/logs/YYYY-MM-DD.jsonl`
- `LOGS_DIR` can redirect log output without changing the rest of the storage model
