# Local OTel Ingestion and Dashboard Design

**Date:** 2026-03-07

## Goal

Create a Bun/Turbo monorepo that runs locally without Docker and can:

- receive OTLP/gRPC traffic on `localhost:14317`
- persist traces/spans and metrics with minimal dependencies
- expose simple query APIs
- render dashboards for two initial use cases:
  - service/database/graphql/service-call visibility for a Node.js app
  - session and tool-call visibility for Codex/Claude telemetry

## Chosen Approach

Use a small monorepo with two apps and one shared package:

- `apps/ingest`: OTLP receiver, storage engine, and HTTP query API
- `apps/dashboard`: React dashboard for the first two views
- `packages/shared`: TypeScript types and small formatting/query helpers

The ingest app will avoid OpenTelemetry SDK/server packages where practical. Instead it will use:

- vendored official OpenTelemetry protobuf definitions
- generic gRPC/protobuf tooling
- SQLite for traces/spans
- a small custom round-robin metric store inspired by Whisper/RRD

## Alternatives Considered

### 1. Everything in SQLite

Pros:
- fastest to build
- easy query model

Cons:
- does not satisfy the metric-storage requirement very well
- less interesting retention behavior

### 2. Full custom binary storage for all telemetry

Pros:
- very low dependency footprint
- complete control

Cons:
- too much surface area for first pass
- slows validation and dashboard work

### 3. Recommended: hybrid storage

Pros:
- keeps metrics aligned with the Whisper/RRD inspiration
- keeps traces/spans simple to query
- easiest path to a working local system

Cons:
- two storage models instead of one

## Architecture

### Ingestion

The ingest app will expose:

- OTLP/gRPC receiver on `14317`
- HTTP API on `14318`

It will support the trace and metric OTLP collector services. The implementation will flatten incoming payloads into:

- span records with resource attributes, timing, and selected derived fields
- metric datapoints routed into per-metric circular archives

### Metrics Retention

On first sight of a metric name, the ingest app will ask OpenAI for a retention profile suggestion. The prompt will include the metric name, unit, description, and datatype. The response will select:

- aggregation kind
- archive resolutions
- retention windows

If the AI step fails, the app will fall back to a deterministic heuristic. Chosen profiles will be cached on disk and reused.

### Query Model

The HTTP API will provide a small set of dashboard-oriented endpoints instead of a generic query language:

- overview summary
- operation hotspots
- service-to-service edges
- recent traces
- agent sessions
- tool-call breakdown
- metric series by name/range

### UI Direction

The dashboard will follow the Uncodixify guidance:

- normal app shell, not a floating showcase
- fixed sidebar
- flat panels with restrained radius
- no hero dashboard section
- neutral warm palette with strong contrast

The layout will prioritize dense signal:

- overview cards as compact summaries, not decorative KPI tiles
- tables for operations and tool calls
- simple inline charts for metric series

## Initial Scope

Included:

- trace/span ingest and storage
- metric ingest and storage
- two starter dashboard views
- live validation from Codex OTLP traffic

Deferred:

- logs
- auth/multi-user support
- arbitrary dashboard builders
- full OTLP feature coverage
- service graph editing/admin UI

## Workflow Deviations

These are intentional and requested by the user:

1. The local `brainstorming` skill normally requires interactive approval before implementation. The user explicitly asked for autonomous execution, so this document records the design instead of blocking on approval.
2. The local worktree workflow normally asks where to create worktrees. The repository started empty on an unborn branch, so implementation begins in-place until the repository has an initial commit.
3. The local subagent workflow expects a dedicated subagent/task tool that is not available in this harness. Parallel tool calls and staged self-review will be used instead.
