# 2026-03-08 Bun Env Docs Validation

## Goal

Correct the workspace docs to match Bun's built-in `.env` loading behavior.

## Validation

- Reviewed Bun runtime environment variable documentation for `bun run`.
- Searched the repo for manual env loading and dotenv-style instructions.
- Confirmed the only stale instruction was the root `README.md` lacking a tracked env template and copy guidance.
- Confirmed the ingest app reads from `process.env` and does not implement its own dotenv loader.
- Confirmed the workspace has no `bunfig.toml` or script wrapper that overrides Bun's default `.env` handling.
- Confirmed `.env.example` is not ignored by `.gitignore`.

## Result

- Added a root `.env.example` that matches the env vars read by the ingest app.
- Updated `README.md` to tell users to copy `.env.example` to `.env`, `.env.$NODE_ENV`, or `.env.local`.
- Kept the environment section documenting the supported env vars and Bun's default `.env` precedence.
- No code changes were required.
