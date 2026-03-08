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
- `bun run --filter @otellmenolies/ingest test`: `12` test files passed, `36/36` tests passed
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

## Live Follow-Up

Observed after running the local dev ingest server and letting Codex/T3 emit logs:

- the server initially crashed on OTLP log payloads containing `null` `AnyValue` fields
- a focused regression test was added for null log bodies/attributes in `apps/ingest/src/__tests__/log-decoder.test.ts`
- the decoder was updated to treat non-object OTLP values as `null` instead of throwing
- live Codex/T3 exports also showed `timeUnixNano: "0"` with valid `observedTimeUnixNano`
- a focused regression test was added to ensure zero event timestamps fall back to observed time
- after the fix, ingest health on `127.0.0.1:14318` returned OK and new Codex log entries were written to `data/logs/2026-03-08.jsonl`
- older incorrectly written entries remain in `data/logs/1970-01-01.jsonl` from before the timestamp fallback fix
