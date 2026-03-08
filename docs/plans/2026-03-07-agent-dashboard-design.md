# Agent Dashboard Expansion Design

**Date:** 2026-03-07
**Status:** Implemented, with additional runtime pruning for Codex transport noise added during live debugging.

## Goal

Extend the existing local agent dashboard so it can show:

- time-based conversation counts
- time-based input and output token totals
- time-based conversation duration trends
- tool-call totals ordered by call volume
- drilldown into tool-call instances, including arguments when present

## Chosen Approach

Keep the current ingest-plus-dashboard shape and add a thin agent analytics layer on top of the existing spans table.

The ingest app will derive a few extra agent fields at write time and expose two dashboard-oriented endpoints:

- `GET /api/agent/overview?range=<seconds>&bucket=<seconds>`
- `GET /api/agent/tools?range=<seconds>&limit=<n>&toolName=<optional>`

The dashboard will consume those endpoints and render small SVG charts plus a click-driven tool drilldown panel.

## Why This Approach

### 1. Raw-span queries only

Pros:
- no schema changes
- fast to start

Cons:
- repeated parsing of tool payloads
- expensive JSON inspection at query time
- harder to keep UI logic simple

### 2. Separate agent tables

Pros:
- cleaner long-term model
- easier future indexing

Cons:
- more migration and write-path complexity than needed
- duplicates data already present in `spans`

### 3. Recommended: enrich the existing spans table

Pros:
- smallest useful change
- cheap queries for timeline and tool drilldown
- keeps the current project simple

Cons:
- a handful of nullable derived columns in `spans`

## Data Model

Add nullable derived columns to `spans`:

- `conversation_id`
- `input_tokens`
- `output_tokens`
- `tool_call_id`
- `tool_arguments`

The decoder will populate these from span attributes where possible.

Field resolution order:

- `conversation_id`: existing session resolution logic, then synthetic Codex bucket fallback
- `input_tokens`: recognized token keys such as `gen_ai.usage.input_tokens`, `usage.input_tokens`, `input_tokens`, and similar variants
- `output_tokens`: recognized token keys such as `gen_ai.usage.output_tokens`, `usage.output_tokens`, `output_tokens`, and similar variants
- `tool_call_id`: direct attributes first, then extracted from Codex `call` payload text
- `tool_arguments`: direct attributes first, then extracted from Codex `call` payload text

If no token values are present, the timelines show zero rather than guessed estimates.

## Query Model

### Agent overview

Returns:

- timeline buckets for:
  - conversation count
  - input tokens
  - output tokens
  - average conversation duration
- recent conversation table entries with:
  - first seen
  - last seen
  - wall-clock duration
  - token totals
  - tool-call totals

Conversation duration is defined as wall-clock `last_seen - first_seen`. This is the better operational signal for agent work because it includes waiting, tool latency, and idle gaps without double-counting parallel spans.

### Tool summary and drilldown

Returns:

- tool totals ordered by descending call count
- per-tool recent call instances with:
  - timestamp
  - conversation id
  - duration
  - trace id
  - tool call id
  - parsed argument payload, when available

The first version will keep drilldown scoped to a selected tool instead of adding full trace navigation.

## UI Direction

Keep the existing warm, dense dashboard language. Avoid glossy KPI-card patterns.

Changes:

- add an `Agent analytics` panel group above the current session table
- use compact line/bar charts built with inline SVG
- render tool totals as a ranked bar list, not a pie chart
- open tool-call instances in a side detail panel below the chart area when a tool is selected
- render arguments in a monospace pre block with truncation for very large payloads

## Constraints and Decisions

- No new charting library. Inline SVG is enough here.
- No token estimation fallback in v1.
- Tool arguments are best-effort. If the source only emits opaque strings, the UI shows that raw string.
- This design intentionally keeps queries dashboard-shaped instead of building a generic analytics API.

## Workflow Deviations

These are intentional and user-requested:

1. The local `brainstorming` skill normally requires interactive approval before implementation. The user explicitly asked for autonomous execution, so this document records the approved-by-default design.
2. The local worktree workflow is being skipped for this feature because the current workspace already contains active uncommitted changes and the user asked to continue in-place.
