"use client";

import { useMemo, useState } from "react";
import DatabaseSidebar from "@/app/components/DatabaseSidebar";
import "./ai-vm-oci.css";

type Section = "overview" | "compute" | "network" | "functions" | "storage" | "monitoring";

const sections: { id: Section; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "Summary" },
  { id: "compute", label: "Compute", short: "VM & instances" },
  { id: "network", label: "Network & Bastion", short: "VCN & access" },
  { id: "functions", label: "Functions", short: "Serverless" },
  { id: "storage", label: "Storage & Database", short: "Buckets & DB" },
  { id: "monitoring", label: "Monitoring & Recovery", short: "Health & actions" },
];

const resources = [
  { name: "OCI Controller VM", type: "Compute instance", state: "Not verified", detail: "Live inventory is not connected yet." },
  { name: "Controller VCN", type: "Virtual network", state: "Snapshot only", detail: "Historical report; refresh required." },
  { name: "HC Connect Functions", type: "Function application", state: "Metadata only", detail: "Lifecycle metadata is not invocation health." },
  { name: "AI Video Gen bucket", type: "Object Storage", state: "Private metadata", detail: "Bucket metadata only; objects are not inspected." },
];

export default function AiVmOciClient() {
  const [active, setActive] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof resources)[number] | null>(null);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => resources.filter((item) => (item.name + " " + item.type + " " + item.state).toLowerCase().includes(query.toLowerCase())), [query]);
  const pageSize = 4;
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="control-room ai-vm-oci-route">
      <DatabaseSidebar mode="ai-vm-oci" />
      <section className="workspace ai-vm-oci-workspace">
        <div className="vmoci-main">
          <header className="vmoci-header">
            <div>
              <span className="vmoci-eyebrow">NEXUS / INTELLIGENCE / INFRASTRUCTURE</span>
              <h1>AI VM-OCI</h1>
              <p>OCI infrastructure control workspace</p>
            </div>
            <div className="vmoci-header-status"><span /> READ-ONLY MODE</div>
          </header>

          <div className="vmoci-notice" role="status">
            <strong>DEMO / INTEGRATION PENDING</strong>
            <span>Data di bawah adalah placeholder UI, bukan kondisi OCI secara live. Koneksi dan validasi sumber data dilakukan pada fase P4.</span>
          </div>

          <nav className="vmoci-tabs" aria-label="AI VM-OCI sections">
            {sections.map((section) => (
              <button key={section.id} type="button" className={active === section.id ? "active" : ""} onClick={() => setActive(section.id)}>
                <span>{section.label}</span><small>{section.short}</small>
              </button>
            ))}
          </nav>

          {active === "overview" ? (
            <>
              <div className="vmoci-kpis">
                <article><span>COMPUTE</span><strong>—</strong><small>Awaiting live inventory</small></article>
                <article><span>NETWORK</span><strong>—</strong><small>Awaiting live inventory</small></article>
                <article><span>FUNCTIONS</span><strong>—</strong><small>Metrics not connected</small></article>
                <article><span>STORAGE</span><strong>—</strong><small>Metadata not refreshed</small></article>
              </div>
              <div className="vmoci-grid">
                <section className="vmoci-panel vmoci-health">
                  <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">SERVICE STATUS</span><h2>Infrastructure health</h2></div><span className="vmoci-tag amber">NOT VERIFIED</span></div>
                  {["Compute & VM", "Network & Bastion", "Functions", "Storage & Database", "Monitoring"].map((name) => <div className="vmoci-health-row" key={name}><span>{name}</span><b>Pending connection</b></div>)}
                </section>
                <section className="vmoci-panel vmoci-operator">
                  <span className="vmoci-eyebrow">CONTROL POLICY</span><h2>Safe operations first</h2>
                  <p>Mode awal hanya untuk membaca dan memeriksa data. Setiap aksi perubahan infrastruktur nantinya wajib melalui validasi parameter, persetujuan, audit trail, dan verifikasi hasil.</p>
                  <div className="vmoci-policy"><span className="vmoci-dot green" /> Read-only baseline</div>
                  <div className="vmoci-policy"><span className="vmoci-dot amber" /> Approval gate for recovery</div>
                  <div className="vmoci-policy"><span className="vmoci-dot red" /> Destructive actions disabled</div>
                </section>
              </div>
            </>
          ) : (
            <section className="vmoci-panel vmoci-section-panel">
              <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">MODULE</span><h2>{sections.find((item) => item.id === active)?.label}</h2></div><span className="vmoci-tag amber">INTEGRATION PENDING</span></div>
              <p className="vmoci-module-intro">Kerangka modul sudah disiapkan. Data OCI aktual akan ditampilkan setelah sumber, cakupan compartment, timestamp, dan status koneksinya tervalidasi.</p>
              <div className="vmoci-placeholder-grid">
                <article><span>DATA SOURCE</span><strong>Not connected</strong><small>Belum ada pembacaan live</small></article>
                <article><span>LAST REFRESH</span><strong>—</strong><small>Timestamp belum tersedia</small></article>
                <article><span>PERMISSION</span><strong>Read-only target</strong><small>Scope akan diverifikasi pada P4</small></article>
              </div>
              {active === "monitoring" && <div className="vmoci-recovery-note">Recovery controls belum aktif. Gateway, approval flow, dan post-action verification dikerjakan pada P5; Grok Agent tetap tahap terakhir.</div>}
            </section>
          )}

          <section className="vmoci-panel vmoci-resource-panel">
            <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">RESOURCE INVENTORY</span><h2>Known resources</h2></div><span className="vmoci-tag neutral">PLACEHOLDER DATA</span></div>
            <div className="vmoci-table-tools"><span>Daftar referensi awal</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search resource..." aria-label="Search resources" /></div>
            <div className="vmoci-table-wrap"><table><thead><tr><th>Resource</th><th>Type</th><th>Observed state</th><th>Detail</th></tr></thead><tbody>
              {visible.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.type}</td><td><span className="vmoci-state">{item.state}</span></td><td><button type="button" className="vmoci-link" onClick={() => setSelected(item)}>View details</button></td></tr>)}
              {visible.length === 0 && <tr><td colSpan={4} className="vmoci-empty">No matching resources.</td></tr>}
            </tbody></table></div>
            <div className="vmoci-pagination"><span>{filtered.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}` : "0 resources"}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(1)}>First</button><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
          </section>
        </div>
      </section>

      {selected && <div className="vmoci-drawer-backdrop" role="presentation" onClick={() => setSelected(null)}><aside className="vmoci-drawer" role="dialog" aria-modal="true" aria-label="Resource details" onClick={(event) => event.stopPropagation()}><button type="button" className="vmoci-drawer-close" onClick={() => setSelected(null)}>×</button><span className="vmoci-eyebrow">RESOURCE DETAIL</span><h2>{selected.name}</h2><p>{selected.type}</p><div className="vmoci-detail-state">{selected.state}</div><p>{selected.detail}</p><p className="vmoci-detail-foot">Source: placeholder record · not live OCI telemetry</p></aside></div>}
    </main>
  );
}
