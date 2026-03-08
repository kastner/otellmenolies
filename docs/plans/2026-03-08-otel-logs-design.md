# OTLP Log Ingest Design

**Date:** 2026-03-08

## Goal

Add minimal OTLP log handling to the ingest daemon by accepting OTLP log exports and persisting them to disk in a simple append-only format.

## Chosen Approach

Use a small file-backed log store that writes newline-delimited JSON entries under the existing data root by default:

- default directory: `data/logs`
- optional override: `LOGS_DIR`
- file naming: one file per UTC day, `YYYY-MM-DD.jsonl`

Each decoded log record becomes one JSON object per line. Every entry includes a normalized millisecond timestamp plus the original OTLP timing fields when present, along with service/resource metadata, severity, body, attributes, and trace/span correlation ids.

This fits the current storage split:

- traces remain in SQLite
- metrics remain in archive files
- logs stay cheap and append-only without adding query or indexing work yet

## Alternatives Considered

### 1. Recommended: daily JSONL files under `data/logs`

Pros:

- smallest implementation
- human-readable and easy to tail
- no schema migration or database changes
- matches the user's request for timestamped file output

Cons:

- no query API yet
- files will mix services unless filtered later

### 2. Per-service subdirectories

Pros:

- easier manual browsing by service

Cons:

- more path churn and sanitization logic
- one export can contain many services, so batching gets awkward fast

### 3. SQLite log table

Pros:

- stronger future query story

Cons:

- heavier than requested
- unnecessary schema/index work for the current scope

## Notes

- The repo's default expectation is autonomous execution, so this design is recorded and implemented without waiting for a separate approval turn unless a high-risk ambiguity appears.
- Log entries use JSONL rather than plain text because timestamped structured data is more useful immediately and still stays simple.
