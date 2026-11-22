"use client";

import { useMemo, useState } from "react";
import DatabaseSidebar from "@/app/components/DatabaseSidebar";
import "./ai-vm-oci.css";

type Section = "overview" | "compute" | "network" | "functions" | "storage" | "monitoring";
type Resource = { name: string; type: string; state: string; detail: string; source: string };
type ModuleConfig = { title: string; eyebrow: string; description: string; columns: string[]; emptyTitle: string; emptyDescription: string };

const sections: { id: Section; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "Summary" },
  { id: "compute", label: "Compute", short: "VM & instances" },
  { id: "network", label: "Network & Bastion", short: "VCN & access" },
  { id: "functions", label: "Functions", short: "Serverless" },
  { id: "storage", label: "Storage & Database", short: "Buckets & DB" },
  { id: "monitoring", label: "Monitoring & Recovery", short: "Health & actions" },
];

const moduleConfig: Record<Exclude<Section, "overview">, ModuleConfig> = {
  compute: { title: "Compute inventory", eyebrow: "COMPUTE / INSTANCES", description: "Inventaris instance, lifecycle state, shape, availability domain, dan waktu pembaruan.", columns: ["Instance", "Compartment", "Shape", "Lifecycle", "Updated"], emptyTitle: "Belum ada inventaris Compute tervalidasi", emptyDescription: "P4 akan menghubungkan OCI Compute API dan memvalidasi compartment serta timestamp sebelum data ditampilkan." },
  network: { title: "Network & Bastion", eyebrow: "VCN / SUBNET / ACCESS", description: "Ringkasan VCN, subnet, route, security list, dan status Bastion/access session.", columns: ["Resource", "Network", "CIDR / Target", "State", "Updated"], emptyTitle: "Belum ada data Network tervalidasi", emptyDescription: "Koneksi VCN dan Bastion belum diuji dari sumber OCI. Tidak ada status akses yang diasumsikan aktif." },
  functions: { title: "Functions inventory", eyebrow: "SERVERLESS / INVOCATIONS", description: "Pisahkan metadata aplikasi/function dari hasil invocation, error, dan durasi eksekusi.", columns: ["Function", "Application", "Invoke status", "Errors", "Updated"], emptyTitle: "Metrik invocation belum tersedia", emptyDescription: "Metadata fungsi saja tidak membuktikan fungsi sehat. P4 akan menguji invocation dan membaca metrik/log aktual." },
  storage: { title: "Storage & Database", eyebrow: "OBJECT STORAGE / HEATWAVE", description: "Inventaris bucket, objek, database, konektivitas, dan indikator kesehatan yang benar-benar terukur.", columns: ["Resource", "Service", "Region", "Observed state", "Updated"], emptyTitle: "Belum ada data Storage / Database tervalidasi", emptyDescription: "Bucket metadata dan status database belum disegarkan. P4 akan memisahkan metadata, koneksi, dan health check." },
  monitoring: { title: "Monitoring & Recovery", eyebrow: "METRICS / ALARMS / AUDIT", description: "Pantau metrik, alarm, log, histori pemeriksaan, dan kesiapan recovery. Aksi perubahan tetap terkunci.", columns: ["Signal", "Source", "Severity", "Last event", "Action"], emptyTitle: "Monitoring live belum terhubung", emptyDescription: "Alarm, metrik, dan log belum dibaca dari OCI. Recovery baru disiapkan di P5 dengan approval dan verifikasi." },
};

const resources: Resource[] = [
  { name: "OCI Controller VM", type: "Compute reference", state: "Not verified", detail: "Nama referensi dari pekerjaan sebelumnya; belum diverifikasi melalui inventory OCI live.", source: "Historical project context" },
  { name: "Controller VCN", type: "Network reference", state: "Snapshot only", detail: "Referensi dari snapshot terdahulu; bukan hasil refresh VCN terkini.", source: "Historical snapshot" },
  { name: "HC Connect Functions", type: "Function reference", state: "Metadata only", detail: "Metadata tidak membuktikan keberhasilan invocation atau health fungsi.", source: "Historical metadata" },
  { name: "AI Video Gen bucket", type: "Object Storage reference", state: "Private metadata", detail: "Belum ada pemeriksaan isi objek atau health bucket secara live.", source: "Historical metadata" },
];

export default function AiVmOciClient() {
  const [active, setActive] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => resources.filter((item) => (item.name + " " + item.type + " " + item.state).toLowerCase().includes(query.toLowerCase())), [query]);
  const pageSize = 4;
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const config = active === "overview" ? null : moduleConfig[active];

  return (
    <main className="control-room ai-vm-oci-route">
      <DatabaseSidebar mode="ai-vm-oci" />
      <section className="workspace ai-vm-oci-workspace">
        <div className="vmoci-main">
          <header className="vmoci-header">
            <div><span className="vmoci-eyebrow">NEXUS / INTELLIGENCE / INFRASTRUCTURE</span><h1>AI VM-OCI</h1><p>OCI infrastructure control workspace</p></div>
            <div className="vmoci-header-status"><span /> READ-ONLY MODE</div>
          </header>

          <div className="vmoci-notice" role="status">
            <strong>DEMO / INTEGRATION PENDING</strong>
            <span>Angka dan status live belum tersedia. Referensi historis diberi label; data aktual baru ditampilkan setelah sumber, scope, dan timestamp tervalidasi pada P4.</span>
          </div>

          <nav className="vmoci-tabs" aria-label="AI VM-OCI sections">
            {sections.map((section) => <button key={section.id} type="button" className={active === section.id ? "active" : ""} aria-pressed={active === section.id} onClick={() => { setActive(section.id); setQuery(""); setPage(1); }}><span>{section.label}</span><small>{section.short}</small></button>)}
          </nav>

          {active === "overview" ? (
            <>
              <div className="vmoci-snapshot-meta"><span>LAST VERIFIED REPORT</span><strong>22 Nov 2026 · 06:30 WIB</strong><small>GitHub Issue #59 / #60 · snapshot, not live feed</small></div>
              <div className="vmoci-kpis">
                <article><span>COMPUTE</span><strong>0 found</strong><small>2 accessible scopes checked · no VM record</small></article>
                <article><span>NETWORK</span><strong>2 available</strong><small>Controller VCN and subnet metadata</small></article>
                <article><span>FUNCTIONS</span><strong>3 / 3 ACTIVE</strong><small>Lifecycle only · invocation metrics NO DATA</small></article>
                <article><span>STORAGE</span><strong>2 private</strong><small>Bucket access metadata · objects not read</small></article>
              </div>
              <section className="vmoci-panel vmoci-evidence-panel">
                <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">EVIDENCE SNAPSHOT</span><h2>Latest OCI read-only observations</h2></div><span className="vmoci-tag amber">PARTIAL / HISTORICAL</span></div>
                <div className="vmoci-evidence-grid">
                  <article><b>Compute</b><strong>NOT FOUND IN ENUMERATED SCOPES</strong><small>2 accessible compartments fully listed; 0 compute records examined</small></article>
                  <article><b>Network</b><strong>VCN + subnet AVAILABLE</strong><small>No broad SSH rule in inspected security lists; NSGs not inspected</small></article>
                  <article><b>Functions</b><strong>3 / 3 ACTIVE</strong><small>Invocation, errors, and duration metrics: NO DATA, not zero</small></article>
                  <article><b>Storage</b><strong>2 buckets PRIVATE</strong><small>ObjectCount: 2 and 22 · StoredBytes: 280 and 77,675,116</small></article>
                  <article><b>Logging</b><strong>HTTP 404 · UNVERIFIED</strong><small>NotAuthorizedOrNotFound; cause not proven</small></article>
                  <article><b>Gateway</b><strong>RAILWAY MCP SLEEPING</strong><small>Not a working live dashboard data feed</small></article>
                </div>
                <div className="vmoci-evidence-footer">Sources: <a href="https://github.com/harisnukurniawan-star/oci-vm-retry/issues/59" target="_blank" rel="noreferrer">OCI REMOTE #59</a> · <a href="https://github.com/harisnukurniawan-star/oci-vm-retry/issues/60" target="_blank" rel="noreferrer">OCI DIAG #60</a>. Reports were generated 21 Nov 2026 at 23:25 and 23:30 UTC. Values are not refreshed automatically.</div>
              </section>
              <div className="vmoci-grid">
                <section className="vmoci-panel vmoci-health">
                  <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">SERVICE STATUS</span><h2>Infrastructure health</h2></div><span className="vmoci-tag amber">NOT VERIFIED</span></div>
                  {["Compute & VM", "Network & Bastion", "Functions", "Storage & Database", "Monitoring"].map((name) => <div className="vmoci-health-row" key={name}><span>{name}</span><b>Pending source validation</b></div>)}
                </section>
                <section className="vmoci-panel vmoci-operator">
                  <span className="vmoci-eyebrow">CONTROL POLICY</span><h2>Safe operations first</h2>
                  <p>Baseline hanya read-only. Setiap aksi perubahan infrastruktur wajib melalui validasi parameter, simulasi dampak, persetujuan, audit trail, verifikasi hasil, dan rencana recovery.</p>
                  <div className="vmoci-policy"><span className="vmoci-dot green" /> Read-only baseline</div>
                  <div className="vmoci-policy"><span className="vmoci-dot amber" /> Approval gate for recovery</div>
                  <div className="vmoci-policy"><span className="vmoci-dot red" /> Destructive actions disabled</div>
                </section>
              </div>
            </>
          ) : config && (
            <section className="vmoci-panel vmoci-section-panel">
              <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">{config.eyebrow}</span><h2>{config.title}</h2></div><span className="vmoci-tag amber">INTEGRATION PENDING</span></div>
              <p className="vmoci-module-intro">{config.description}</p>
              <div className="vmoci-placeholder-grid">
                <article><span>DATA SOURCE</span><strong>Not connected</strong><small>Belum ada pembacaan live</small></article>
                <article><span>LAST REFRESH</span><strong>—</strong><small>Timestamp belum tersedia</small></article>
                <article><span>ACCESS SCOPE</span><strong>Read-only target</strong><small>Compartment dan permission diverifikasi di P4</small></article>
              </div>
              <div className="vmoci-module-table">
                <div className="vmoci-table-wrap"><table><thead><tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={config.columns.length} className="vmoci-empty"><strong>{config.emptyTitle}</strong><span>{config.emptyDescription}</span></td></tr></tbody></table></div>
              </div>
              {active === "monitoring" && <div className="vmoci-recovery-note">Recovery controls disabled. P5 akan menyiapkan gateway, approval gate, audit trail, dan post-action verification. Grok AI Agent tetap tahap terakhir.</div>}
            </section>
          )}

          <section className="vmoci-panel vmoci-resource-panel">
            <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">RESOURCE REFERENCES</span><h2>Known resources</h2></div><span className="vmoci-tag neutral">HISTORICAL / UNVERIFIED</span></div>
            <div className="vmoci-table-tools"><span>Referensi terdahulu · bukan live inventory</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search resource..." aria-label="Search resources" /></div>
            <div className="vmoci-table-wrap"><table><thead><tr><th>Resource</th><th>Type</th><th>Observed state</th><th>Source</th><th>Detail</th></tr></thead><tbody>
              {visible.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.type}</td><td><span className="vmoci-state">{item.state}</span></td><td>{item.source}</td><td><button type="button" className="vmoci-link" onClick={() => setSelected(item)}>View details</button></td></tr>)}
              {visible.length === 0 && <tr><td colSpan={5} className="vmoci-empty">No matching references.</td></tr>}
            </tbody></table></div>
            <div className="vmoci-pagination"><span>{filtered.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}` : "0 resources"}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(1)}>First</button><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
          </section>
        </div>
      </section>

      {selected && <div className="vmoci-drawer-backdrop" role="presentation" onClick={() => setSelected(null)}><aside className="vmoci-drawer" role="dialog" aria-modal="true" aria-label="Resource details" onClick={(event) => event.stopPropagation()}><button type="button" className="vmoci-drawer-close" onClick={() => setSelected(null)}>×</button><span className="vmoci-eyebrow">RESOURCE DETAIL</span><h2>{selected.name}</h2><p>{selected.type}</p><div className="vmoci-detail-state">{selected.state}</div><p>{selected.detail}</p><p className="vmoci-detail-foot">Source: {selected.source} · not live OCI telemetry</p></aside></div>}
    </main>
  );
}
