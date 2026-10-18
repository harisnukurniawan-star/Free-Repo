"use client";

import { useMemo, useState } from "react";
import type { HcActivity, HcSignal } from "@/lib/hc-connect-activity";

const dateText = (value: string) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) + " WIB";
};
const stageName = (name: string) => /latency watch/i.test(name) ? "OCI Function API" : /backup monitor/i.test(name) ? "Backup OCI HeatWave" : name;
const stateName = (state: string, conclusion: string) => state !== "completed" ? "Berjalan / antri" : conclusion === "success" ? "Berhasil" : conclusion === "failure" ? "Gagal" : conclusion || "Belum diketahui";
function Kpi({ label, value, meta, tone }: { label: string; value: string; meta: string; tone?: "ok" | "warn" }) {
  return <div className={"hc-ops-kpi " + (tone ? "hc-ops-kpi-" + tone : "")}><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>;
}
function AlertRow({ signal }: { signal: HcSignal }) {
  return <div className="hc-ops-alert-row">
    <span className={"hc-ops-alert-chip hc-ops-" + signal.category}>{signal.category === "error" ? "ERROR" : signal.category === "issue" ? "ISSUE" : "BACKLOG"}</span>
    <div><strong>{signal.title}</strong><small>{signal.detail}</small></div>
    <span className="hc-ops-alert-time">{dateText(signal.at)}</span>
    <a href={signal.url} target="_blank" rel="noopener noreferrer" aria-label={"Lihat detail " + signal.title}>Detail ↗</a>
  </div>;
}
export default function HcOperationsOverview({ activity }: { activity: HcActivity }) {
  const [filter, setFilter] = useState<"all" | "error" | "issue" | "backlog">("all");
  const [page, setPage] = useState(0);
  const { github: gh } = activity;
  const matched = useMemo(() => activity.signals.filter(s => filter === "all" || s.category === filter), [activity.signals, filter]);
  const totalPages = Math.max(1, Math.ceil(matched.length / 3));
  const safePage = Math.min(page, totalPages - 1);
  const active = gh.runs.filter(x => x.state === "queued" || x.state === "in_progress");
  const latestRun = gh.runs[0];
  const operations = [
    { id: "api", title: "OCI Function API latency watch", match: /latency watch/i },
    { id: "backup", title: "OCI HeatWave daily backup monitor", match: /backup monitor/i },
  ].map(x => ({ ...x, run: gh.runs.find(r => x.match.test(r.name)) }));
  const failed = activity.signals.filter(s => s.category === "error").length;
  const ghComplete = gh.runsSource === "live" && gh.issuesSource === "live" && gh.prsSource === "live";
  return <div className="hc-ops-layout" aria-label="Overview operasional dan pengembangan HC Connect">
    <div className="hc-ops-kpis">
      <Kpi label="WEB PRODUKSI" value={activity.website.state === "online" ? "Online" : activity.website.state === "error" ? "HTTP error" : "Tidak terpantau"}
        meta={activity.website.code ? "HTTP " + activity.website.code + " · " + dateText(activity.website.checkedAt) : "Pemeriksaan tidak tersedia"}
        tone={activity.website.state === "online" ? "ok" : activity.website.state === "error" ? "warn" : undefined} />
      <Kpi label="PEKERJAAN TERBUKA" value={gh.prsSource === "live" ? gh.prs.length + " PR" : "Belum tersedia"}
        meta={gh.prsSource === "live" ? "GitHub · branch pekerjaan yang belum merged" : "Sumber GitHub PR tidak terhubung"} />
      <Kpi label="WORKFLOW TERBARU" value={gh.runsSource === "live" ? active.length ? active.length + " berjalan" : latestRun ? stateName(latestRun.state, latestRun.conclusion) : "Belum ada" : "Tidak terpantau"}
        meta={gh.runsSource === "live" && latestRun ? stageName(latestRun.name) + " · " + dateText(latestRun.at) : "Status GitHub Actions belum tersedia"} />
      <Kpi label="TEMUAN & BACKLOG" value={ghComplete ? activity.signals.length + " temuan" : "Parsial"}
        meta={ghComplete ? failed + " sinyal error · " + gh.issuesCount + " GitHub issue · " + activity.signals.filter(s => s.category === "backlog").length + " backlog" : "Sumber yang gagal tidak dihitung sebagai nol"}
        tone={failed ? "warn" : undefined} />
    </div>

    <div className="hc-ops-middle">
      <article className="panel hc-ops-section">
        <div className="panel-head"><div><span className="eyebrow">WEB DEVELOPMENT</span><h2>Pengembangan & progres terbaru</h2></div><span className="hc-ops-source">{gh.commitsSource === "live" ? "GITHUB · LIVE" : "Belum terhubung"}</span></div>
        <div className="hc-ops-panel-body">
          {gh.commits.slice(0, 3).map(c => <a className="hc-ops-progress-row" key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer">
            <span className="hc-ops-sha">{c.sha}</span><div><strong>{c.title}</strong><small>Commit · {dateText(c.at)}</small></div><span aria-hidden="true">↗</span>
          </a>)}
          {gh.commits.length === 0 && <div className="hc-ops-empty">Riwayat perubahan belum dapat diperbarui.</div>}
          <div className="hc-ops-development-footer"><span>{gh.prsSource === "live" ? gh.prs.length + " PR menunggu review/merge" : "PR: tidak terpantau"}</span>
          <a href="https://github.com/jakgunn20-maker/hcbp-hub/pulls" target="_blank" rel="noopener noreferrer">Buka pekerjaan ↗</a></div>
        </div>
      </article>
      <article className="panel hc-ops-section">
        <div className="panel-head"><div><span className="eyebrow">LIVE OPERATIONS</span><h2>Operasi & pemantauan yang berjalan</h2></div><span className="hc-ops-source">READ-ONLY</span></div>
        <div className="hc-ops-panel-body">
          <div className="hc-ops-operating-row"><div><strong>HC Connect · Website</strong><small>Pemeriksaan respons URL publik, bukan uji transaksi</small></div><span className={activity.website.state === "online" ? "hc-ops-good" : "hc-ops-muted"}>{activity.website.code ? "HTTP " + activity.website.code : "Tidak tersedia"}</span></div>
          {operations.map(x => <div className="hc-ops-operating-row" key={x.id}>
            <div><strong>{x.title}</strong><small>{x.run ? "Dijalankan " + dateText(x.run.at) : "Tidak ada data run dalam histori terambil"}</small></div>
            {x.run ? <a className={x.run.conclusion === "success" ? "hc-ops-good" : "hc-ops-muted"} href={x.run.url} target="_blank" rel="noopener noreferrer">{stateName(x.run.state, x.run.conclusion)} ↗</a> : <span className="hc-ops-muted">Belum terpantau</span>}
          </div>)}
          <div className="hc-ops-operating-row"><div><strong>Vercel · Production</strong><small>Metadata deployment, bukan pemeriksaan seluruh fungsi</small></div><span className={activity.vercel.source === "live" && activity.vercel.production?.state === "READY" ? "hc-ops-good" : "hc-ops-muted"}>{activity.vercel.source === "live" ? activity.vercel.production?.state || "Tidak ada produksi" : "Belum terhubung"}</span></div>
          <div className="hc-ops-operating-row"><div><strong>Runtime error produksi</strong><small>Belum ada koneksi telemetry error server/browser pada dashboard</small></div><span className="hc-ops-muted">Belum terhubung</span></div>
        </div>
      </article>
    </div>
    <article className="panel hc-ops-section hc-ops-alerts">
      <div className="panel-head"><div><span className="eyebrow">BUG, ERROR & BACKLOG</span><h2>Temuan terbaru dan pekerjaan belum selesai</h2></div>
        <div className="hc-ops-filters">
          {([["all","Semua"],["error","Error"],["issue","Issue"],["backlog","Backlog"]] as const).map(([k, label]) => <button type="button" key={k} className={filter === k ? "selected" : ""} onClick={() => { setFilter(k); setPage(0); }}>{label}</button>)}
        </div>
      </div>
      <div className="hc-ops-alert-body">
        <div className="hc-ops-alert-list">
          {matched.slice(safePage * 3, safePage * 3 + 3).map(s => <AlertRow key={s.id} signal={s}/>)}
          {matched.length === 0 && <div className="hc-ops-empty">
            {ghComplete ? "Tidak ada temuan di kategori ini pada sumber yang berhasil dibaca. Ini bukan jaminan bebas bug." : "Sumber pemantauan belum lengkap. Tidak ada temuan yang bisa dikonfirmasi."}
          </div>}
        </div>
        <div className="hc-ops-alert-footer">
          <span>Gagal CI ≠ error produksi · PR backlog ≠ bug terbukti · sumber: GitHub dan HTTP</span>
          <div className="hc-ops-pager"><button type="button" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0,p-1))}>‹</button><span>{safePage + 1}/{totalPages}</span><button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages-1,p+1))}>›</button></div>
        </div>
      </div>
    </article>
    <p className="hc-ops-disclaimer">Pemeriksaan {dateText(activity.checkedAt)} · GitHub diperbarui maksimal setiap 2 menit · OCI HeatWave masih memakai snapshot lama pada tab Storage & Health. Status HTTP / CI tidak menjamin transaksi bebas error.</p>
  </div>;
}
