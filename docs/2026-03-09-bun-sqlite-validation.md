# 2026-03-09 Bun SQLite Validation

## Commands

- `bun run --filter @otellmenolies/ingest lint`
- `bun run --filter @otellmenolies/ingest test`
- `bun run dev`

## Results

- `bun run --filter @otellmenolies/ingest lint` exited `0`.
- `bun run --filter @otellmenolies/ingest test` exited `0` with `40 pass` and `0 fail`.
- `bun run dev` started both dev servers successfully once stale listeners from earlier runs were cleared:
  - ingest: `otellmenolies ingest listening on grpc 14317 and http 14318`
  - dashboard: `Local: http://localhost:5173/`

## Notes

- The original Bun startup failure from `better-sqlite3` did not recur after switching the ingest storage layer to `bun:sqlite`.
- Bun-native test execution exposed an existing preflight response issue in the Fastify hook path. Validation passed after moving preflight handling to an explicit `OPTIONS` route.
