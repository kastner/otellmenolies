import { useEffect, useState } from "react";
import {
  formatCount,
  formatDurationMs,
  formatTimestamp
} from "@otellmenolies/shared";

type OverviewResponse = {
  edges: Array<{
    count: number;
    fromService: string;
    toService: string;
  }>;
  hotspots: Array<{
    avgDurationMs: number;
    category: string;
    operationName: string;
    p95DurationMs: number;
    serviceName: string;
    spanCount: number;
  }>;
  services: Array<{
    avgDurationMs: number;
    operationCount: number;
    serviceName: string;
    spanCount: number;
  }>;
  summary: {
    sessionCount: number;
    spanCount: number;
    traceCount: number;
  };
};

type TracesResponse = {
  traces: Array<{
    durationMs: number;
    rootSpanName: string;
    serviceName: string;
    spanCount: number;
    traceId: string;
  }>;
};

type SessionsResponse = {
  sessions: Array<{
    firstSeenAt: number;
    lastSeenAt: number;
    serviceName: string;
    sessionId: string;
    toolCallCount: number;
    toolNames: string[];
    traceCount: number;
  }>;
};

type MetricsCatalogResponse = {
  metrics: Array<{
    aggregation: string;
    metricName: string;
    serviceNames: string[];
    unit?: string;
  }>;
};

type MetricSeriesResponse = {
  metricName: string;
  points: Array<{
    bucketStartMs: number;
    count: number;
    value: number;
  }>;
  profile: {
    aggregation: string;
    source: string;
  } | null;
  serviceNames?: string[];
  unit?: string;
};

type AgentOverviewResponse = {
  conversationTimeline: TimelinePoint[];
  conversations: Array<{
    conversationId: string;
    durationMs: number;
    firstSeenAt: number;
    inputTokens: number;
    lastSeenAt: number;
    outputTokens: number;
    serviceName: string;
    toolCallCount: number;
    toolNames: string[];
    traceCount: number;
  }>;
  durationTimeline: TimelinePoint[];
  inputTokenTimeline: TimelinePoint[];
  outputTokenTimeline: TimelinePoint[];
  summary: {
    conversationCount: number;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
  };
};

type ToolUsageResponse = {
  selectedTool?: {
    calls: Array<{
      arguments?: string;
      calledAt: number;
      conversationId?: string;
      durationMs: number;
      serviceName: string;
      spanId: string;
      toolCallId?: string;
      toolName: string;
      traceId: string;
    }>;
    toolName: string;
  };
  tools: Array<{
    avgDurationMs: number;
    callCount: number;
    lastCalledAt: number;
    toolName: string;
  }>;
};

type UnifiedOverviewResponse = {
  byService: Array<{
    inputTokens: number;
    outputTokens: number;
    serviceName: string;
    toolCallCount: number;
  }>;
  inputTokenTimeline: TimelinePoint[];
  outputTokenTimeline: TimelinePoint[];
  summary: {
    cacheReadTokens: number;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
    totalCostUsd: number;
  };
  toolCallTimeline: TimelinePoint[];
  tools: Array<{
    avgDurationMs: number;
    callCount: number;
    lastCalledAt: number;
    serviceName: string;
    toolName: string;
  }>;
};

type TimelinePoint = {
  bucketStartMs: number;
  value: number;
};

type DashboardData = {
  agentOverview: AgentOverviewResponse | null;
  lastUpdatedAt: number | null;
  metricSeries: MetricSeriesResponse[];
  metricsCatalog: MetricsCatalogResponse["metrics"];
  overview: OverviewResponse | null;
  sessions: SessionsResponse["sessions"];
  toolUsage: ToolUsageResponse | null;
  traces: TracesResponse["traces"];
  unified: UnifiedOverviewResponse | null;
};

const INITIAL_DATA: DashboardData = {
  agentOverview: null,
  lastUpdatedAt: null,
  metricSeries: [],
  metricsCatalog: [],
  overview: null,
  sessions: [],
  toolUsage: null,
  traces: [],
  unified: null
};

export function App({
  apiBaseUrl = "http://127.0.0.1:14318",
  refreshIntervalMs = 5_000
}: {
  apiBaseUrl?: string;
  refreshIntervalMs?: number;
}) {
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    let controller: AbortController | null = null;

    const load = async () => {
      controller = new AbortController();

      try {
        const next = await fetchDashboardData(
          apiBaseUrl,
          selectedToolName,
          controller.signal
        );

        if (!active) {
          return;
        }

        setData({
          ...next,
          lastUpdatedAt: Date.now()
        });
        setError(null);
      } catch (loadError) {
        if (controller?.signal.aborted) {
          return;
        }

        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Failed to load dashboard data."
        );
      } finally {
        if (active) {
          setLoading(false);
          timeoutId = window.setTimeout(() => {
            void load();
          }, refreshIntervalMs);
        }
      }
    };

    void load();

    return () => {
      active = false;
      controller?.abort();

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [apiBaseUrl, refreshIntervalMs, selectedToolName]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>otellmenolies</strong>
          <span>local ingest + dashboards</span>
        </div>

        <nav className="nav">
          <a href="#services">Service telemetry</a>
          <a href="#agent-analytics">Agent analytics</a>
          <a href="#sessions">Agent sessions</a>
          <a href="#metrics">Metric trends</a>
        </nav>

        <dl className="summary-list">
          <div>
            <dt>Spans</dt>
            <dd>{formatCount(data.overview?.summary.spanCount ?? 0)}</dd>
          </div>
          <div>
            <dt>Traces</dt>
            <dd>{formatCount(data.overview?.summary.traceCount ?? 0)}</dd>
          </div>
          <div>
            <dt>Conversations</dt>
            <dd>{formatCount(data.agentOverview?.summary.conversationCount ?? 0)}</dd>
          </div>
        </dl>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>Telemetry</h1>
            <p>
              {loading
                ? "Loading data..."
                : error
                  ? error
                  : `Updated ${formatTimestamp(data.lastUpdatedAt)}`}
            </p>
          </div>
        </header>

        <section id="services" className="section">
          <div className="section-heading">
            <h2>Service telemetry</h2>
          </div>

          <div className="summary-strip">
            <StatBlock
              label="Services"
              value={formatCount(data.overview?.services.length ?? 0)}
            />
            <StatBlock
              label="Hot operations"
              value={formatCount(data.overview?.hotspots.length ?? 0)}
            />
            <StatBlock
              label="Service edges"
              value={formatCount(data.overview?.edges.length ?? 0)}
            />
          </div>

          <div className="panel-grid">
            <section className="panel">
              <h3>Services</h3>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Spans</th>
                    <th>Operations</th>
                    <th>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.overview?.services ?? []).map((service) => (
                    <tr key={service.serviceName}>
                      <td>{service.serviceName}</td>
                      <td>{formatCount(service.spanCount)}</td>
                      <td>{formatCount(service.operationCount)}</td>
                      <td>{formatDurationMs(service.avgDurationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h3>Operation hotspots</h3>
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Category</th>
                    <th>Spans</th>
                    <th>P95</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.overview?.hotspots ?? []).map((hotspot) => (
                    <tr key={`${hotspot.serviceName}:${hotspot.operationName}`}>
                      <td>{hotspot.operationName}</td>
                      <td>{hotspot.category}</td>
                      <td>{formatCount(hotspot.spanCount)}</td>
                      <td>{formatDurationMs(hotspot.p95DurationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h3>Service edges</h3>
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.overview?.edges ?? []).map((edge) => (
                    <tr key={`${edge.fromService}:${edge.toService}`}>
                      <td>{edge.fromService}</td>
                      <td>{edge.toService}</td>
                      <td>{formatCount(edge.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h3>Recent traces</h3>
              <table>
                <thead>
                  <tr>
                    <th>Root span</th>
                    <th>Service</th>
                    <th>Spans</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.traces.map((trace) => (
                    <tr key={trace.traceId}>
                      <td>{trace.rootSpanName}</td>
                      <td>{trace.serviceName}</td>
                      <td>{formatCount(trace.spanCount)}</td>
                      <td>{formatDurationMs(trace.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </section>

        <section id="agent-analytics" className="section">
          <div className="section-heading">
            <h2>Agent analytics</h2>
            <p>Unified view across all agent services</p>
          </div>

          <div className="summary-strip summary-strip-wide">
            <StatBlock
              label="Input tokens"
              value={formatCount(data.unified?.summary.inputTokens ?? 0)}
            />
            <StatBlock
              label="Output tokens"
              value={formatCount(data.unified?.summary.outputTokens ?? 0)}
            />
            <StatBlock
              label="Cache read"
              value={formatCount(data.unified?.summary.cacheReadTokens ?? 0)}
            />
            <StatBlock
              label="Tool calls"
              value={formatCount(data.unified?.summary.toolCallCount ?? 0)}
            />
            <StatBlock
              label="Cost"
              value={`$${(data.unified?.summary.totalCostUsd ?? 0).toFixed(2)}`}
            />
          </div>

          <div className="panel-grid">
            <TrendPanel
              title="Input tokens"
              subtitle="Prompt and request tokens (all services)"
              value={formatCount(data.unified?.summary.inputTokens ?? 0)}
              points={data.unified?.inputTokenTimeline ?? []}
            />
            <TrendPanel
              title="Output tokens"
              subtitle="Model response tokens (all services)"
              value={formatCount(data.unified?.summary.outputTokens ?? 0)}
              points={data.unified?.outputTokenTimeline ?? []}
            />
            <TrendPanel
              title="Tool calls"
              subtitle="Tool invocations (all services)"
              value={formatCount(data.unified?.summary.toolCallCount ?? 0)}
              points={data.unified?.toolCallTimeline ?? []}
            />
          </div>

          <div className="panel-grid agent-detail-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3>By service</h3>
                  <p>Token and tool usage per agent service</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Input tokens</th>
                    <th>Output tokens</th>
                    <th>Tool calls</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.unified?.byService ?? []).map((svc) => (
                    <tr key={svc.serviceName}>
                      <td>{svc.serviceName}</td>
                      <td>{formatCount(svc.inputTokens)}</td>
                      <td>{formatCount(svc.outputTokens)}</td>
                      <td>{formatCount(svc.toolCallCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3>Tool calls by tool</h3>
                  <p>Across all services</p>
                </div>
              </div>
              <div className="tool-ranking">
                {(data.unified?.tools ?? []).map((tool) => (
                  <button
                    key={`${tool.serviceName}:${tool.toolName}`}
                    className="tool-row"
                    type="button"
                    onClick={() => {
                      setSelectedToolName(tool.toolName);
                    }}
                  >
                    <span className="tool-row-meta">
                      <strong>{tool.toolName}</strong>
                      <span>
                        {tool.serviceName} &middot; {formatCount(tool.callCount)} calls
                        {tool.avgDurationMs > 0 ? `, avg ${formatDurationMs(tool.avgDurationMs)}` : ""}
                      </span>
                    </span>
                    <span
                      className="tool-row-bar"
                      style={{
                        width: `${resolveToolBarWidth(
                          tool.callCount,
                          data.unified?.tools ?? []
                        )}%`
                      }}
                    />
                  </button>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section id="sessions" className="section">
          <div className="section-heading">
            <h2>Agent sessions</h2>
          </div>

          <div className="panel-grid single-column">
            <section className="panel">
              <h3>Recent sessions</h3>
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Service</th>
                    <th>Tools</th>
                    <th>Tool calls</th>
                    <th>Traces</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((session) => (
                    <tr key={session.sessionId}>
                      <td>{session.sessionId}</td>
                      <td>{session.serviceName}</td>
                      <td>{session.toolNames.join(", ") || "none"}</td>
                      <td>{formatCount(session.toolCallCount)}</td>
                      <td>{formatCount(session.traceCount)}</td>
                      <td>{formatTimestamp(session.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </section>

        <section id="metrics" className="section">
          <div className="section-heading">
            <h2>Metric trends</h2>
          </div>

          <div className="panel-grid single-column">
            <section className="panel">
              <h3>Tracked metrics</h3>
              <div className="metric-list">
                {data.metricSeries.map((series) => (
                  <article key={series.metricName} className="metric-row">
                    <div className="metric-meta">
                      <strong>{series.metricName}</strong>
                      <span>
                        {(series.serviceNames ?? []).join(", ") || "unknown service"}
                      </span>
                    </div>
                    <div className="metric-chart">
                      <Sparkline points={series.points.map((point) => point.value)} />
                    </div>
                    <div className="metric-value">
                      {series.points.length > 0
                        ? `${formatDurationMs(series.points.at(-1)?.value ?? 0)}${
                            series.unit && series.unit !== "ms" ? ` ${series.unit}` : ""
                          }`
                        : "no data"}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatBlock({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="stat-block">
      <div>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function TrendPanel({
  points,
  subtitle,
  title,
  value
}: {
  points: TimelinePoint[];
  subtitle: string;
  title: string;
  value: string;
}) {
  return (
    <section className="panel trend-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <strong className="trend-value">{value}</strong>
      </div>
      <div className="trend-chart">
        <Sparkline points={points.map((point) => point.value)} />
      </div>
    </section>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) {
    return <div className="sparkline-empty">no data</div>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coordinates = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 100 - ((point - min) / range) * 100;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={coordinates} />
    </svg>
  );
}

async function fetchDashboardData(
  apiBaseUrl: string,
  selectedToolName: string | null,
  signal?: AbortSignal
): Promise<DashboardData> {
  const toolQuery = new URLSearchParams({
    limit: "12",
    range: "3600"
  });

  if (selectedToolName) {
    toolQuery.set("toolName", selectedToolName);
  }

  const [overview, traces, sessions, metricsCatalog, agentOverview, toolUsage, unified] =
    (await Promise.all([
      fetchJson(`${apiBaseUrl}/api/overview?range=3600`, signal),
      fetchJson(`${apiBaseUrl}/api/traces?limit=8&range=3600`, signal),
      fetchJson(`${apiBaseUrl}/api/sessions?range=3600`, signal),
      fetchJson(`${apiBaseUrl}/api/metrics/catalog`, signal),
      fetchJson(`${apiBaseUrl}/api/agent/overview?range=3600&bucket=300`, signal),
      fetchJson(`${apiBaseUrl}/api/agent/tools?${toolQuery.toString()}`, signal),
      fetchJson(`${apiBaseUrl}/api/agent/unified?range=3600&bucket=300`, signal)
    ])) as [
      OverviewResponse,
      TracesResponse,
      SessionsResponse,
      MetricsCatalogResponse,
      AgentOverviewResponse,
      ToolUsageResponse,
      UnifiedOverviewResponse
    ];

  const metricSeries = await Promise.all(
    metricsCatalog.metrics.slice(0, 4).map(async (metric) => {
      const query = new URLSearchParams({
        name: metric.metricName,
        range: "3600"
      });

      return (await fetchJson(
        `${apiBaseUrl}/api/metrics/series?${query.toString()}`,
        signal
      )) as MetricSeriesResponse;
    })
  );

  return {
    agentOverview,
    lastUpdatedAt: null,
    metricSeries,
    metricsCatalog: metricsCatalog.metrics,
    overview,
    sessions: sessions.sessions,
    toolUsage,
    traces: traces.traces,
    unified
  };
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    signal
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }

  return response.json();
}

function resolveToolBarWidth(
  callCount: number,
  tools: Array<{ callCount: number }>
) {
  const maxCount = Math.max(1, ...tools.map((tool) => tool.callCount));
  return Math.max(12, (callCount / maxCount) * 100);
}
