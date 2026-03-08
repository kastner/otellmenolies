# README GitHub Refresh Validation

**Date:** 2026-03-08

## Scope

Validate the README refresh for GitHub publication:

- add agent telemetry setup notes for Codex, Cursor, and Claude Code
- tighten the behavior notes to match the current ingest implementation
- replace local absolute file links with repo-relative Markdown links

## Evidence reviewed

Local repo checks:

- `README.md`
- `apps/ingest/src/otel/trace-decoder.ts`
- `apps/ingest/src/logs/log-decoder.ts`
- `apps/ingest/src/storage/span-store.ts`
- `apps/ingest/src/storage/activity-store.ts`
- `apps/ingest/src/__tests__/trace-decoder.test.ts`
- `apps/ingest/src/__tests__/log-decoder.test.ts`

External docs reviewed on 2026-03-08:

- OpenAI Codex help: Codex CLI and IDE extension availability in Cursor
- OpenAI Codex config reference: OTEL config keys and `tool_output_token_limit`
- Anthropic Claude Code monitoring docs: OTEL env-var setup and exported telemetry details

## Verification commands

```bash
git diff --check
bun run build
bun run test
```

## Verification results

- `git diff --check`: PASS
- `bun run build`: PASS
- `bun run test`: FAIL in `@otellmenolies/dashboard`
- failing dashboard tests are existing app/test mismatches, not README regressions
- observed failures:
  - `App > does not start a new refresh while the current dashboard load is still pending`
  - `App > renders service and agent telemetry from the ingest api`
- observed runtime mismatch in the failing render test:
  - the app requests `/api/agent/unified?range=3600&bucket=300`
  - the test fixture still treats that URL as unexpected and renders an empty agent state

## README outcomes

- Codex setup uses the local `~/.codex/config.toml` snippet that is known-good for this repo
- Cursor is described as using the Codex IDE extension path rather than a separate undocumented native Cursor telemetry path
- Claude Code setup uses OTEL environment variables pointing to `http://localhost:14317`
- behavior notes mention generic OTLP normalization plus the Codex-specific filtering/pruning behavior
- verification links are repository-relative and render correctly on GitHub
