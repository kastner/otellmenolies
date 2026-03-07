# 2026-03-07 Live Validation

## Environment

- Ingest daemon: `bun run dev:ingest`
- Dashboard dev server: `bun run --filter @otellmenolies/dashboard dev --host 127.0.0.1 --port 14319`
- OTLP gRPC: `127.0.0.1:14317`
- Ingest HTTP API: `127.0.0.1:14318`
- Dashboard: `127.0.0.1:14319`

## Verified commands

### Workspace verification

```bash
bun run test
bun run build
```

Observed:

- workspace tests passed
- workspace build passed

### Live health

```bash
curl -s http://127.0.0.1:14318/health
```

Observed:

```json
{"grpcPort":14317,"httpPort":14318,"ok":true}
```

### Dashboard dev server

```bash
curl -sI http://127.0.0.1:14319/
```

Observed: `HTTP/1.1 200 OK`

### Codex live OTLP

Codex-generated spans reached the ingest daemon automatically after startup.

Observed through the API:

```bash
curl -s 'http://127.0.0.1:14318/api/sessions?range=600'
```

Representative response:

```json
{
  "sessions": [
    {
      "sessionId": "codex-app-server@984951",
      "serviceName": "codex-app-server",
      "toolCallCount": 6,
      "toolNames": ["exec_command"]
    }
  ]
}
```

### Synthetic service trace

A generic gRPC client using the vendored protos sent one trace with:

- `POST /graphql`
- `SELECT widgets`
- `POST billing`

Observed through the API:

```bash
curl -s 'http://127.0.0.1:14318/api/overview?range=600'
```

Representative fields:

```json
{
  "summary": { "sessionCount": 1 },
  "edges": [{ "fromService": "gateway", "toService": "billing", "count": 1 }]
}
```

The overview also contained hotspot rows for:

- `POST /graphql` with category `graphql`
- `SELECT widgets` with category `db`
- `POST billing` with category `service_call`

### Synthetic metrics

A generic gRPC client using the vendored protos sent:

- `http.server.duration`
- `gateway.request.latency.ai.final`

Observed through the API:

```bash
curl -s 'http://127.0.0.1:14318/api/metrics/catalog'
```

Representative response:

```json
{
  "metrics": [
    { "metricName": "gateway.request.latency.ai.final", "aggregation": "avg" },
    { "metricName": "http.server.duration", "aggregation": "avg" }
  ]
}
```

## AI-backed metric retention

What was verified:

- the metric profile advisor module successfully used OpenAI and returned an `ai` profile when invoked directly
- archive normalization was verified for multiple model output formats:
  - explicit `resolutionSeconds`
  - `secondsPerPoint`
  - `precision` + `retention`
  - compact strings like `10s:7d`

Current runtime note:

- under live daemon load, first-seen metric profile generation can still fall back to heuristics
- that fallback is intentional and the ingest path continues working

## Notable implementation decisions

- Codex session ids are synthesized because the live spans observed here did not include an explicit session identifier
- low-signal Codex transport spans are filtered so the dashboard queries stay responsive
- no Docker, no collector sidecar, and no OpenTelemetry server package are required

## Attribution

Implementation and validation in this repository were executed with the T3 Code harness using GPT-5.4 High.
