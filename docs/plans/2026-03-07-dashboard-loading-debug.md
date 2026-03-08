# 2026-03-07 Dashboard Loading Debug Plan

**Status:** Implemented on 2026-03-07.

## Goal

Make the local dashboard render promptly under live Codex OTLP traffic instead of staying on `Loading data...` with repeated pending fetches.

## Root cause summary

- The ingest HTTP server was not dead; it was being starved by synchronous `better-sqlite3` work.
- The persisted database contained roughly 4.28 million Codex rows from the last hour.
- Nearly all of those rows were low-value `service_name = "codex-app-server"` and `category = "app"` transport spans.
- The dashboard was issuing several heavy refresh queries in parallel every 5 seconds, so slow responses stacked into more slow responses.

## Fix plan

1. Stop retaining Codex `app` spans and other non-canonical tool bookkeeping spans during ingest.
2. Prune the existing Codex noise rows on database startup so current local state becomes usable after a restart.
3. Replace interval-based dashboard polling with a single in-flight refresh loop and abort stale requests when the component reloads.
4. Verify with package tests, workspace tests/build, live API checks, and a real browser path against `http://localhost:5173/`.

## Attribution

This debugging plan was prepared in the T3 Code harness using GPT-5.4 High.
