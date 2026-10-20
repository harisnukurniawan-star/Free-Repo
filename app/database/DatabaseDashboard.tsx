"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import DatabaseSidebar from "@/app/components/DatabaseSidebar";
import HcOperationsOverview from "@/app/database/hc-connect/HcOperationsOverview";
import type { HcActivity } from "@/lib/hc-connect-activity";
import type { OciControllerEvidence } from "@/lib/oci-controller-activity";
import { useRouter } from "next/navigation";
import type { DbHealth, DbOverview, DbSchema, DbTable } from "@/types/database";

type TableNodeData = { table: DbTable; selected: boolean; dimmed: boolean };

function formatBytes(value: number) {
  if (!value) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 10 || i < 2 ? n.toFixed(0) : n.toFixed(2)} ${units[i]}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value > 999999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

function formatTimestamp(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const visible = data.table.columns.slice(0, 6);
  return (
    <div className={`table-node ${data.selected ? "selected" : ""} ${data.dimmed ? "dimmed" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="table-node-head">
        <div>
          <strong>{data.table.name}</strong>
          <span>{formatNumber(data.table.rows)} rows · {formatBytes(data.table.totalBytes)}</span>
        </div>
        <span className="node-dot" />
      </div>
      <div className="table-node-columns">
        {visible.map((c) => (
          <div className="column-row" key={c.name}>
            <span className="column-symbol">{c.primary ? "◆" : c.foreign ? "→" : "·"}</span>
            <span>{c.name}</span>
            <small>{c.type}</small>
          </div>
        ))}
        {data.table.columns.length > visible.length && (
          <div className="column-more">+{data.table.columns.length - visible.length} columns</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { table: TableNode };

function buildPositions(tables: DbTable[]) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(tables.length)));
  return new Map(
    tables.map((t, i) => [t.name, { x: (i % cols) * 310, y: Math.floor(i / cols) * 250 }]),
  );
}

export default function DatabaseDashboard({ activity, controller }: { activity: HcActivity; controller: OciControllerEvidence }) {
  const router = useRouter();
  const [overview, setOverview] = useState<DbOverview | null>(null);
  const [schema, setSchema] = useState<DbSchema>({ tables: [], relations: [] });
  const [health, setHealth] = useState<DbHealth | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [o, s, h] = await Promise.all([
        fetch("/api/database/overview", { cache: "no-store" }),
        fetch("/api/database/schema", { cache: "no-store" }),
        fetch("/api/database/health", { cache: "no-store" }),
      ]);
      const [od, sd, hd] = await Promise.all([o.json(), s.json(), h.json()]);
      setOverview(od);
      setSchema(sd.tables ? sd : { tables: [], relations: [] });
      setHealth(hd);
      setLastError(o.ok && s.ok && h.ok ? null : "One or more database checks are unavailable.");
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Failed to refresh dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Schedule the initial read outside the synchronous effect body; cancel on unmount.
    const initial = window.setTimeout(() => { void loadAll(); }, 0);
    const id = window.setInterval(() => { void loadAll(); }, 60000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 120000);
    return () => window.clearInterval(id);
  }, [router]);

  const selectedTable = schema.tables.find((t) => t.name === selected) || null;
  const relatedTables = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>([selected]);
    for (const r of schema.relations) {
      if (r.fromTable === selected) set.add(r.toTable);
      if (r.toTable === selected) set.add(r.fromTable);
    }
    return set;
  }, [schema.relations, selected]);

  const filteredTables = useMemo(
    () => schema.tables.filter((t) => t.name.toLowerCase().includes(query.toLowerCase().trim())),
    [schema.tables, query],
  );

  const nodes = useMemo<Node<TableNodeData>[]>(() => {
    const positions = buildPositions(filteredTables);
    return filteredTables.map((table) => ({
      id: table.name,
      type: "table",
      position: positions.get(table.name) || { x: 0, y: 0 },
      data: {
        table,
        selected: selected === table.name,
        dimmed: Boolean(selected && !relatedTables.has(table.name)),
      },
    }));
  }, [filteredTables, relatedTables, selected]);

  const visibleNames = useMemo(() => new Set(filteredTables.map((t) => t.name)), [filteredTables]);
  const edges = useMemo<Edge[]>(
    () =>
      schema.relations
        .filter((r) => visibleNames.has(r.fromTable) && visibleNames.has(r.toTable))
        .map((r) => {
          const active = !selected || r.fromTable === selected || r.toTable === selected;
          return {
            id: r.id,
            source: r.fromTable,
            target: r.toTable,
            label: r.fromColumn,
            animated: Boolean(selected && active),
            style: {
              stroke: active ? "#2563eb" : "#cbd5e1",
              strokeWidth: active ? 2 : 1,
              opacity: selected && !active ? 0.2 : 0.9,
            },
            labelStyle: { fill: "#64748b", fontSize: 10 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: active ? "#2563eb" : "#cbd5e1",
            },
          };
        }),
    [schema.relations, selected, visibleNames],
  );

  const topTables = useMemo(
    () => [...schema.tables].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 6),
    [schema.tables],
  );
  const maxTableSize = topTables[0]?.totalBytes || 1;
  const dataPct = overview?.totalBytes
    ? Math.round((overview.dataBytes / overview.totalBytes) * 100)
    : 0;
  const snapshotMode = overview?.mode === "snapshot";


  const refreshCurrent = () => { void loadAll(); router.refresh(); };
  const [hcTab, setHcTab] = useState<"overview" | "schema" | "storage">("overview");
  const renderSchemaPanel = (full: boolean) => (
    <section className={`panel schema-panel hc-schema-panel ${full ? "hc-schema-full" : "hc-schema-overview"}`}>
          <div className="panel-head">
            <div>
              <span className="eyebrow">SCHEMA MAP</span>
              <h2>Relational view</h2>
            </div>
            <div className="schema-tools">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search table..." aria-label="Cari nama tabel" />
              {selected && <button type="button" onClick={() => setSelected(null)}>Clear highlight</button>}
            </div>
          </div>
          <div className="schema-body">
            <div className="flow-wrap">
              {loading ? (
                <div className="center-state">Loading database metadata…</div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => setSelected(node.id)}
                  fitView
                  fitViewOptions={{ padding: 0.18 }}
                  minZoom={0.2}
                  maxZoom={1.6}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={22} size={1} color="#dbe3ee" />
                  <MiniMap pannable zoomable nodeColor="#bfdbfe" maskColor="rgba(248,250,252,.78)" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              )}
            </div>
            <aside className="detail-panel">
              {selectedTable ? (
                <>
                  <div className="detail-title">
                    <span className="node-dot" />
                    <div><small>TABLE DETAILS</small><h3>{selectedTable.name}</h3></div>
                  </div>
                  <div className="detail-stats">
                    <div><span>Rows</span><strong>{formatNumber(selectedTable.rows)}</strong></div>
                    <div><span>Total</span><strong>{formatBytes(selectedTable.totalBytes)}</strong></div>
                    <div><span>Data</span><strong>{formatBytes(selectedTable.dataBytes)}</strong></div>
                    <div><span>Index</span><strong>{formatBytes(selectedTable.indexBytes)}</strong></div>
                  </div>
                  <div className="detail-section">
                    <span className="detail-label">COLUMNS</span>
                    {selectedTable.columns.map((c) => (
                      <div className="detail-column" key={c.name}>
                        <span>{c.primary ? "◆" : c.foreign ? "→" : "·"} {c.name}</span>
                        <small>{c.type}</small>
                      </div>
                    ))}
                  </div>
                  <div className="detail-section">
                    <span className="detail-label">RELATIONSHIPS</span>
                    {schema.relations
                      .filter((r) => r.fromTable === selected || r.toTable === selected)
                      .map((r) => (
                        <div className="relation-item" key={r.id}>
                          <strong>{r.fromTable}.{r.fromColumn}</strong>
                          <span>→ {r.toTable}.{r.toColumn}</span>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div className="detail-empty">
                  <div>⌘</div>
                  <strong>Select a table</strong>
                  <p>Click any node to inspect columns and highlight connected tables.</p>
                </div>
              )}
            </aside>
          </div>
        </section>
  );

  return (
    <main className="control-room terrace-one-view hc-one-view">
      <DatabaseSidebar mode="hc" ociConnected={Boolean(overview?.connected)} ociSnapshot={snapshotMode} />
      <section className={"workspace terrace-workspace hc-workspace " + (hcTab === "overview" ? "hc-ops-mode" : "")}>
        <header className="topbar terrace-topbar hc-topbar">
          <div>
            <span className="eyebrow">{hcTab === "overview" ? "CONTROL ROOM / HC CONNECT" : "DATABASE / OCI HEATWAVE"}</span>
            <h1>HC Connect</h1>
            <p>{hcTab === "overview" ? "Status pengembangan website, operasi layanan, dan bug/error terbaru" : "Database Overview · Read-only metadata, relasi dan performa MySQL"}</p>
          </div>
          <div className="top-actions">
            <span className="terrace-zoom-label">ONE VIEW · 100%</span>
            <span className={`hc-status-pill ${hcTab === "overview" ? (activity.website.state === "online" ? "live" : "offline") : overview?.connected ? (snapshotMode ? "snapshot" : "live") : "offline"}`}>
              <span aria-hidden="true">●</span> {hcTab === "overview" ? (activity.website.state === "online" ? "WEB ONLINE" : "WEB UNVERIFIED") : overview?.connected ? (snapshotMode ? "SNAPSHOT" : "LIVE") : "OFFLINE"}
            </span>
            <button type="button" className="refresh-button" onClick={refreshCurrent}>↻ Refresh</button>
          </div>
        </header>

        <div className="hc-alerts">
          {lastError && <div role="alert" className="error-banner">{lastError}</div>}
          {hcTab !== "overview" && overview?.message && <div className="info-banner">{overview.message}</div>}
          {hcTab === "overview" && <div className="info-banner">Pemantauan read-only HC Connect · GitHub, workflow pemantauan OCI, dan respons website. Telemetri runtime belum lengkap; status database snapshot tersedia di Storage &amp; Health.</div>}
          {hcTab !== "overview" && !overview?.message && !lastError && <div className="info-banner">Read-only OCI metadata. Tidak ada perubahan atau penyimpanan isi tabel database dari Control Room.</div>}
        </div>

        <div className="terrace-tabs hc-tabs" role="tablist" aria-label="HC Connect sections">
          {([
            ["overview", "Overview"],
            ["schema", "Schema Map"],
            ["storage", "Storage & Health"],
          ] as const).map(([key, title]) => (
            <button key={key} type="button" role="tab" aria-selected={hcTab === key} className={hcTab === key ? "selected" : ""} onClick={() => setHcTab(key)}>{title}</button>
          ))}
        </div>

        {hcTab !== "overview" && <section className="metric-grid hc-metrics" aria-label="Ringkasan OCI Database">
          <article className="metric-card">
            <span>Source</span>
            <strong className={overview?.connected ? "good" : "bad"}>{snapshotMode ? "OCI Snapshot" : overview?.connected ? "Connected" : "Offline"}</strong>
            <small>{snapshotMode ? `Synced ${formatTimestamp(overview?.checkedAt)}` : `${overview?.latencyMs ?? "—"} ms latency`}</small>
          </article>
          <article className="metric-card"><span>Database footprint</span><strong>{formatBytes(overview?.totalBytes || 0)}</strong><small>Data + indexes</small></article>
          <article className="metric-card"><span>Tables</span><strong>{overview?.tableCount ?? "—"}</strong><small>{schema.relations.length} FK relations</small></article>
          <article className="metric-card"><span>Approx. rows</span><strong>{formatNumber(overview?.approximateRows || 0)}</strong><small>InnoDB metadata estimate</small></article>
          <article className="metric-card"><span>Connections</span><strong>{overview?.activeConnections ?? "—"}</strong><small>At snapshot time</small></article>
        </section>}

        <div className="terrace-content hc-content">
          {hcTab === "overview" && <HcOperationsOverview activity={activity} overview={overview} controller={controller} />}
          {hcTab === "schema" && <div className="hc-schema-view">{renderSchemaPanel(true)}</div>}

          {hcTab === "storage" && (
            <div className="hc-storage-view">
              <article className="panel hc-largest-panel">
                <div className="panel-head"><div><span className="eyebrow">STORAGE</span><h2>Largest tables</h2></div></div>
                <div className="bars">
                  {topTables.map(t => (
                    <div className="bar-row" key={t.name}>
                      <div className="bar-label"><strong>{t.name}</strong><span>{formatBytes(t.totalBytes)}</span></div>
                      <div className="bar-track"><div style={{ width: `${Math.max(4, (t.totalBytes / maxTableSize) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </article>
              <article className="panel hc-data-panel">
                <div className="panel-head"><div><span className="eyebrow">COMPOSITION</span><h2>Data vs index</h2></div></div>
                <div className="composition">
                  <div className="donut" style={{ background: `conic-gradient(#2563eb ${dataPct}%, #dbe3ee 0)` }}><div><strong>{dataPct}%</strong><span>DATA</span></div></div>
                  <div className="legend">
                    <div><span className="legend-dot data" /><div><small>Data</small><strong>{formatBytes(overview?.dataBytes || 0)}</strong></div></div>
                    <div><span className="legend-dot index" /><div><small>Indexes</small><strong>{formatBytes(overview?.indexBytes || 0)}</strong></div></div>
                  </div>
                </div>
              </article>
              <article className="panel hc-runtime-panel">
                <div className="panel-head">
                  <div><span className="eyebrow">SERVER HEALTH</span><h2>MySQL runtime</h2></div>
                  <small>{overview?.serverVersion ? `MySQL ${overview.serverVersion} · ` : ""}{snapshotMode ? "Snapshot " : "Updated "}{formatTimestamp(overview?.checkedAt)}</small>
                </div>
                <div className="health-grid">
                  <div><span>Uptime</span><strong>{formatUptime(health?.uptimeSeconds || 0)}</strong></div>
                  {(health?.metrics || []).map(m => (
                    <div key={m.key}><span>{m.label}</span><strong>{formatNumber(m.value)}</strong></div>
                  ))}
                </div>
              </article>
            </div>
          )}
        </div>
        <footer className="terrace-footer hc-footer">HC Connect · Read-only metadata · {snapshotMode ? `Snapshot ${formatTimestamp(overview?.checkedAt)}` : "Monitoring OCI"} · Kolom, foreign keys, dan detail tabel tetap tersedia di Schema Map.</footer>
      </section>
    </main>
  );
}
