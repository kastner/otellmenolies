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

### Agent analytics and tool drilldown

Fresh synthetic Codex-style OTLP traffic was sent to an isolated ingest instance on alternate ports to avoid interference from an already-running local process on `14317` and `14318`.

Verification instance:

- OTLP gRPC: `127.0.0.1:14337`
- HTTP API: `127.0.0.1:14338`

Sent payload highlights:

- `conversation.id = "verify-conv-1"`
- `tool_name = "exec_command"`
- `gen_ai.usage.input_tokens = 321`
- `gen_ai.usage.output_tokens = 123`
- Codex-style `call` payload containing:
  - `call_id = "call-verify-1"`
  - tool arguments JSON with `cmd` and `workdir`

Observed through the API:

```bash
curl -s 'http://127.0.0.1:14338/api/agent/overview?range=3600&bucket=300'
curl -s 'http://127.0.0.1:14338/api/agent/tools?range=3600&limit=12&toolName=exec_command'
```

Representative response fields:

```json
{
  "summary": {
    "conversationCount": 1,
    "inputTokens": 321,
    "outputTokens": 123,
    "toolCallCount": 1
  },
  "conversations": [
    {
      "conversationId": "verify-conv-1",
      "toolNames": ["exec_command"]
    }
  ],
  "selectedTool": {
    "calls": [
      {
        "toolCallId": "call-verify-1",
        "arguments": "{\n  \"cmd\": \"pwd\",\n  \"workdir\": \"/tmp/verify\"\n}"
      }
    ]
  }
}
```

### Dashboard loading recovery

After the database accumulated millions of Codex transport spans, the dashboard previously stayed on `Loading data...` and browser requests to the ingest API piled up.

Observed root cause:

- the startup database contained about `4,284,046` rows
- `4,283,749` of those rows were `codex-app-server` spans with category `app`
- `/health` connections established but did not return while SQLite was occupied with dashboard aggregation queries

Fix validation:

```bash
curl -s http://127.0.0.1:14318/health
curl -s 'http://127.0.0.1:14318/api/overview?range=3600'
sqlite3 data/telemetry.sqlite 'select count(*) total, sum(case when service_name=''codex-app-server'' and category=''app'' then 1 else 0 end) codex_app_rows from spans;'
'/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary' --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom http://localhost:5173/
```

Observed after restart with pruning enabled:

- `/health` returned immediately with `{"ok":true}`
- `/api/overview?range=3600` returned a normal JSON payload immediately
- database contents were reduced to `54` total rows with `0` remaining Codex `app` rows
- headless Chrome rendered the dashboard DOM with:
  - `Updated ...` in the top bar instead of `Loading data...`
  - summary values `Spans 53`, `Traces 4`, and `Conversations 5`
  - populated `Service telemetry` and `Agent analytics` sections

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
- tool drilldown prioritizes argument-bearing call instances over duplicate bookkeeping spans for the same tool
- no Docker, no collector sidecar, and no OpenTelemetry server package are required

## Attribution

Implementation and validation in this repository were executed with the T3 Code harness using GPT-5.4 High.
