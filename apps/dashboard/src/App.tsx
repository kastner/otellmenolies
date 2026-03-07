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

type DashboardData = {
  lastUpdatedAt: number | null;
  metricSeries: MetricSeriesResponse[];
  metricsCatalog: MetricsCatalogResponse["metrics"];
  overview: OverviewResponse | null;
  sessions: SessionsResponse["sessions"];
  traces: TracesResponse["traces"];
};

const INITIAL_DATA: DashboardData = {
  lastUpdatedAt: null,
  metricSeries: [],
  metricsCatalog: [],
  overview: null,
  sessions: [],
  traces: []
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

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await fetchDashboardData(apiBaseUrl);

        if (!active) {
          return;
        }

        setData({
          ...next,
          lastUpdatedAt: Date.now()
        });
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Failed to load dashboard data."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    const intervalId = window.setInterval(load, refreshIntervalMs);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, refreshIntervalMs]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>otellmenolies</strong>
          <span>local ingest + dashboards</span>
        </div>

        <nav className="nav">
          <a href="#services">Service telemetry</a>
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
            <dt>Sessions</dt>
            <dd>{formatCount(data.overview?.summary.sessionCount ?? 0)}</dd>
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

async function fetchDashboardData(apiBaseUrl: string): Promise<DashboardData> {
  const overview = (await fetchJson(
    `${apiBaseUrl}/api/overview?range=3600`
  )) as OverviewResponse;
  const traces = (await fetchJson(
    `${apiBaseUrl}/api/traces?limit=8&range=3600`
  )) as TracesResponse;
  const sessions = (await fetchJson(
    `${apiBaseUrl}/api/sessions?range=3600`
  )) as SessionsResponse;
  const metricsCatalog = (await fetchJson(
    `${apiBaseUrl}/api/metrics/catalog`
  )) as MetricsCatalogResponse;
  const metricSeries = await Promise.all(
    metricsCatalog.metrics.slice(0, 4).map(async (metric) => {
      const query = new URLSearchParams({
        name: metric.metricName,
        range: "3600"
      });

      return (await fetchJson(
        `${apiBaseUrl}/api/metrics/series?${query.toString()}`
      )) as MetricSeriesResponse;
    })
  );

  return {
    lastUpdatedAt: null,
    metricSeries,
    metricsCatalog: metricsCatalog.metrics,
    overview,
    sessions: sessions.sessions,
    traces: traces.traces
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }

  return response.json();
}
