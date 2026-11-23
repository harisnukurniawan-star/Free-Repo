"use client";

import { useEffect, useMemo, useState } from "react";
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
  compute: { title: "Inventaris VM", eyebrow: "MESIN VIRTUAL", description: "Daftar mesin virtual, spesifikasi instance, dan status operasional yang berhasil diverifikasi.", columns: ["Mesin Virtual", "Kompartemen", "Spesifikasi", "Status VM", "Waktu Data"], emptyTitle: "Inventaris VM belum tersedia", emptyDescription: "Data VM belum ditemukan pada cakupan kompartemen yang dapat diakses. Hasil ini tidak membuktikan VM tidak ada di seluruh tenancy." },
  network: { title: "Jaringan dan Keamanan Akses", eyebrow: "VCN / SUBNET / KEAMANAN", description: "Periksa topologi VCN dan subnet serta aturan keamanan akses jaringan.", columns: ["Komponen", "Jaringan", "Rincian", "Status", "Waktu Data"], emptyTitle: "Data jaringan belum tersedia", emptyDescription: "Data VCN, subnet, dan aturan keamanan belum dapat diverifikasi dari laporan yang tersedia." },
  functions: { title: "Daftar dan Status Functions", eyebrow: "LAYANAN BACKEND", description: "Daftar fungsi backend dan status lifecycle. Status aktif tidak otomatis berarti proses berhasil dijalankan.", columns: ["Nama Fungsi", "Aplikasi", "Hasil Eksekusi", "Status", "Waktu Data"], emptyTitle: "Riwayat eksekusi belum tersedia", emptyDescription: "Laporan saat ini hanya memuat metadata lifecycle; hasil invocation, error, dan durasi eksekusi belum tersedia." },
  storage: { title: "Penyimpanan dan Keamanan Data", eyebrow: "OBJECT STORAGE", description: "Daftar bucket dan status akses penyimpanan. Kapasitas dan isi objek hanya ditampilkan jika tersedia dari sumber data.", columns: ["Nama Penyimpanan", "Layanan", "Region", "Status Akses", "Waktu Data"], emptyTitle: "Data penyimpanan belum tersedia", emptyDescription: "Belum ada data kapasitas atau isi objek. Informasi yang tersedia saat ini terbatas pada metadata bucket." },
  monitoring: { title: "Kesehatan Sistem dan Pemulihan", eyebrow: "PEMANTAUAN / ALARM / LOG", description: "Pantau kesehatan sistem, peringatan, catatan gangguan, dan kesiapan pemulihan.", columns: ["Indikator", "Sumber", "Tingkat Gangguan", "Waktu Kejadian", "Tindakan"], emptyTitle: "Pemantauan langsung belum terhubung", emptyDescription: "Metrik, alarm, dan log OCI belum tersedia. Fitur pemulihan tetap nonaktif sampai mekanisme persetujuan dan verifikasi siap." },
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
  const [snapshot, setSnapshot] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/oci/snapshot", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Snapshot API HTTP ${response.status}`);
        return data;
      })
      .then((data) => { if (!cancelled) setSnapshot(data); })
      .catch((error) => { if (!cancelled) setSnapshotError(error instanceof Error ? error.message : "Snapshot unavailable"); })
      .finally(() => { if (!cancelled) setSnapshotLoading(false); });
    return () => { cancelled = true; };
  }, []);
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
            <div><span className="vmoci-eyebrow">NEXUS / INTELLIGENCE / INFRASTRUCTURE</span><h1>AI VM-OCI</h1><p>Pusat kendali infrastruktur OCI</p></div>
            <div className="vmoci-header-status"><span /> READ-ONLY MODE</div>
          </header>

          <div className="vmoci-notice" role="status">
            <strong>{snapshot?.status === "reported" ? "OCI REPORT CONNECTED" : snapshotLoading ? "CONNECTING OCI REPORT" : "OCI SOURCE NOT CONNECTED"}</strong>
            <span>{snapshot?.status === "reported" ? `Read-only report · ${snapshot.region} · observed ${snapshot.observedAt} · ${snapshot.source}. Dated metadata snapshot, not continuous live telemetry.` : snapshotError || "Menunggu konfigurasi OCI_GITHUB_READ_TOKEN pada server untuk membaca laporan privat."}</span>
          </div>

          <nav className="vmoci-tabs" aria-label="AI VM-OCI sections">
            {sections.map((section) => <button key={section.id} type="button" className={active === section.id ? "active" : ""} aria-pressed={active === section.id} onClick={() => { setActive(section.id); setQuery(""); setPage(1); }}><span>{section.label}</span><small>{section.short}</small></button>)}
          </nav>

          {active === "overview" ? (
            <>
              <div className="vmoci-kpis">
                <article><span>MESIN VIRTUAL</span><strong>{snapshot?.compute?.recordsExamined ?? "—"}</strong><small>{snapshot?.compute?.discovery ?? "Report unavailable"}</small></article>
                <article><span>JARINGAN</span><strong>{snapshot?.network?.vcn ?? "—"}</strong><small>{snapshot?.network?.subnet ?? "Report unavailable"}</small></article>
                <article><span>FUNCTIONS</span><strong>{snapshot?.functions?.active ?? "—"}</strong><small>Lifecycle metadata only</small></article>
                <article><span>PENYIMPANAN</span><strong>{snapshot?.storage?.buckets?.length ?? "—"}</strong><small>Reported bucket metadata</small></article>
              </div>
              <div className="vmoci-grid">
                <section className="vmoci-panel vmoci-health">
                  <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">RINGKASAN KONDISI</span><h2>Status Layanan Infrastruktur</h2></div><span className="vmoci-tag amber">{snapshot?.status === "reported" ? "SNAPSHOT ONLY" : "NOT VERIFIED"}</span></div>
                  {[
                    ["Compute & VM", snapshot?.compute?.discovery ?? "Awaiting report"],
                    ["Network & Bastion", snapshot?.network?.vcn ?? "Awaiting report"],
                    ["Functions", snapshot?.functions?.active ?? "Awaiting report"],
                    ["Storage & Database", snapshot?.storage?.buckets?.length != null ? `${snapshot.storage.buckets.length} buckets reported` : "Awaiting report"],
                    ["Monitoring", "NOT ESTABLISHED"],
                  ].map(([name, state]) => <div className="vmoci-health-row" key={name}><span>{name}</span><b>{state}</b></div>)}
                </section>
                <section className="vmoci-panel vmoci-operator">
                  <span className="vmoci-eyebrow">KEBIJAKAN OPERASIONAL</span><h2>Operasi Aman dan Terkendali</h2>
                  <p>Baseline hanya read-only. Setiap aksi perubahan infrastruktur wajib melalui validasi parameter, simulasi dampak, persetujuan, audit trail, verifikasi hasil, dan rencana recovery.</p>
                  <div className="vmoci-policy"><span className="vmoci-dot green" /> Read-only baseline</div>
                  <div className="vmoci-policy"><span className="vmoci-dot amber" /> Approval gate for recovery</div>
                  <div className="vmoci-policy"><span className="vmoci-dot red" /> Destructive actions disabled</div>
                </section>
              </div>
            </>
          ) : config && (
            <section className="vmoci-panel vmoci-section-panel">
              <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">{config.eyebrow}</span><h2>{config.title}</h2></div><span className={`vmoci-tag ${snapshot?.status === "reported" && active !== "monitoring" ? "neutral" : "amber"}`}>{snapshot?.status === "reported" && active !== "monitoring" ? "SNAPSHOT DATA" : "NOT ESTABLISHED"}</span></div>
              <p className="vmoci-module-intro">{config.description}</p>
              <div className="vmoci-placeholder-grid">
                <article><span>DATA SOURCE</span><strong>{snapshot?.status === "reported" && active !== "monitoring" ? "GitHub OCI report" : "Not connected"}</strong><small>{snapshot?.source || "OCI telemetry not available"}</small></article>
                <article><span>LAST OBSERVED</span><strong>{snapshot?.observedAt || "—"}</strong><small>{snapshot?.region || "Region not reported"}</small></article>
                <article><span>ACCESS SCOPE</span><strong>{snapshot?.coverage?.compartmentsChecked ?? "—"} compartments</strong><small>{snapshot?.coverage?.note || "Scope not established"}</small></article>
              </div>
              <div className="vmoci-module-table">
                <div className="vmoci-table-wrap"><table><thead><tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
                  {active === "compute" && snapshot?.status === "reported" && <tr><td>Controller VM discovery</td><td>{snapshot.coverage?.compartmentsChecked ?? "—"} checked</td><td>Not reported</td><td>{snapshot.compute?.discovery ?? "NOT REPORTED"}</td><td>{snapshot.observedAt ?? "—"}</td></tr>}
                  {active === "network" && snapshot?.status === "reported" && <>
                    <tr><td>Controller VCN</td><td>{snapshot.region ?? "—"}</td><td>—</td><td>{snapshot.network?.vcn ?? "NOT REPORTED"}</td><td>{snapshot.observedAt ?? "—"}</td></tr>
                    <tr><td>Controller subnet</td><td>{snapshot.region ?? "—"}</td><td>—</td><td>{snapshot.network?.subnet ?? "NOT REPORTED"}</td><td>{snapshot.observedAt ?? "—"}</td></tr>
                    <tr><td>SSH ingress exposure</td><td>Security lists</td><td>NSGs not inspected</td><td>{snapshot.network?.sshIngress ?? "NOT REPORTED"}</td><td>{snapshot.observedAt ?? "—"}</td></tr>
                  </>}
                  {active === "functions" && snapshot?.status === "reported" && <tr><td>Functions lifecycle</td><td>{snapshot.functions?.application ?? "—"}</td><td>Invocation metrics unavailable</td><td>{snapshot.functions?.active ?? "NOT REPORTED"}</td><td>{snapshot.observedAt ?? "—"}</td></tr>}
                  {active === "storage" && snapshot?.status === "reported" && (snapshot.storage?.buckets ?? []).map((bucket: {name:string;state:string}) => <tr key={bucket.name}><td>{bucket.name}</td><td>Object Storage</td><td>{snapshot.region ?? "—"}</td><td>{bucket.state}</td><td>{snapshot.observedAt ?? "—"}</td></tr>)}
                  {active === "monitoring" && <tr><td colSpan={config.columns.length} className="vmoci-empty"><strong>{config.emptyTitle}</strong><span>{config.emptyDescription}</span></td></tr>}
                  {active === "compute" && snapshot?.status === "reported" && <tr><td colSpan={config.columns.length} className="vmoci-empty"><strong>{snapshot.compute?.recordsExamined ?? "0"} compute records examined</strong><span>Discovery hanya mencakup compartment yang dapat diakses. Hasil NOT_FOUND bukan bukti bahwa tidak ada VM di seluruh tenancy.</span></td></tr>}
                  {active === "storage" && snapshot?.status === "reported" && !(snapshot.storage?.buckets ?? []).length && <tr><td colSpan={config.columns.length} className="vmoci-empty">Tidak ada bucket yang dilaporkan pada snapshot ini.</td></tr>}
                  {snapshot?.status !== "reported" && active !== "monitoring" && <tr><td colSpan={config.columns.length} className="vmoci-empty"><strong>{config.emptyTitle}</strong><span>{snapshotError || "Snapshot OCI belum tersedia. Tidak ada nilai yang diasumsikan."}</span></td></tr>}
                </tbody></table></div>
              </div>
              {active === "functions" && <div className="vmoci-recovery-note">{snapshot?.functions?.note || "Lifecycle ACTIVE bukan bukti endpoint sehat; invocation dan metrik belum diperiksa."}</div>}
              {active === "storage" && <div className="vmoci-recovery-note">{snapshot?.storage?.note || "Metadata bucket saja; isi objek dan lifecycle belum diperiksa."}</div>}
              {active === "monitoring" && <div className="vmoci-recovery-note">Monitoring live belum terhubung. Health tetap NOT ESTABLISHED; tidak ada metrik, alarm, atau log yang diklaim tersedia. Recovery controls disabled.</div>}
            </section>
          )}

          {active === "overview" && (<section className="vmoci-panel vmoci-resource-panel">
            <div className="vmoci-panel-head"><div><span className="vmoci-eyebrow">REFERENSI INFRASTRUKTUR</span><h2>Referensi Sumber Daya</h2></div><span className="vmoci-tag neutral">DATA LAMA / BELUM TERVERIFIKASI</span></div>
            <div className="vmoci-table-tools"><span>Referensi terdahulu · bukan inventaris langsung</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Cari sumber daya..." aria-label="Cari sumber daya" /></div>
            <div className="vmoci-table-wrap"><table><thead><tr><th>Sumber Daya</th><th>Jenis</th><th>Status Tercatat</th><th>Sumber Data</th><th>Detail</th></tr></thead><tbody>
              {visible.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.type}</td><td><span className="vmoci-state">{item.state}</span></td><td>{item.source}</td><td><button type="button" className="vmoci-link" onClick={() => setSelected(item)}>Lihat detail</button></td></tr>)}
              {visible.length === 0 && <tr><td colSpan={5} className="vmoci-empty">No matching references.</td></tr>}
            </tbody></table></div>
            <div className="vmoci-pagination"><span>{filtered.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}` : "0 resources"}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(1)}>First</button><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
          </section>)}
        </div>
      </section>

      {selected && <div className="vmoci-drawer-backdrop" role="presentation" onClick={() => setSelected(null)}><aside className="vmoci-drawer" role="dialog" aria-modal="true" aria-label="Resource details" onClick={(event) => event.stopPropagation()}><button type="button" className="vmoci-drawer-close" onClick={() => setSelected(null)}>×</button><span className="vmoci-eyebrow">RESOURCE DETAIL</span><h2>{selected.name}</h2><p>{selected.type}</p><div className="vmoci-detail-state">{selected.state}</div><p>{selected.detail}</p><p className="vmoci-detail-foot">Sumber: {selected.source} · bukan telemetry OCI langsung</p></aside></div>}
    </main>
  );
}
