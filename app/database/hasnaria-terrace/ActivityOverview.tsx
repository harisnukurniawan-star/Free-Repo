"use client";

import { useMemo, useState } from "react";
import type { HasnariaActivity, ActivitySignal } from "@/lib/hasnaria-activity";
import type { HasnariaData } from "@/lib/hasnaria-monitoring";

type Props = { activity: HasnariaActivity; data: HasnariaData; onOpenPrs: () => void };
const when = (value: string) => {
  if (!value || Number.isNaN(Date.parse(value))) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";
};
const sourceTag = (source: "live" | "snapshot" | "unavailable") =>
  source === "live" ? "Diperiksa" : source === "snapshot" ? "Snapshot" : "Belum terhubung";
const safeFallback = (value: string, source: "live" | "snapshot" | "unavailable") =>
  source === "unavailable" ? "Belum tersedia" : value;
function MiniCard({label,value,desc,tone="neutral"}:{label:string;value:string;desc:string;tone?:"neutral"|"positive"|"warning"}) {
  return <div className={`ops-kpi ops-kpi-${tone}`}><span>{label}</span><strong>{value}</strong><small>{desc}</small></div>;
}
function SignalRow({item}:{item:ActivitySignal}) {
  return <div className="ops-signal-row">
    <span className={`ops-indicator ${item.kind==="ci"?"ops-indicator-error":"ops-indicator-warning"}`}>{item.kind==="ci"?"CI ERROR":"ISSUE"}</span>
    <div className="ops-signal-main"><strong>{item.title}</strong><small>{item.detail}</small></div>
    <span className="ops-signal-date">{when(item.at)}</span>
    <a href={item.url} target="_blank" rel="noopener noreferrer">Detail ↗</a>
  </div>;
}
export default function ActivityOverview({activity,data,onOpenPrs}:Props) {
  const [filter,setFilter] = useState<"all"|"ci"|"issue">("all");
  const [page,setPage] = useState(0);
  const matched = useMemo(()=>activity.signals.filter(x=>filter==="all"||x.kind===filter),[activity.signals,filter]);
  const pages = Math.max(1,Math.ceil(matched.length/3));
  const safePage=Math.min(page,pages-1);
  const displayed=matched.slice(safePage*3,safePage*3+3);
  const ciActive=activity.runs.filter(r=>r.status==="in_progress"||r.status==="queued").length;
  const newest=activity.runs[0];
  const failureCount=activity.signals.filter(s=>s.kind==="ci").length;
  const needsReview=data.openPrs.filter(p=>/fix|bug|error|finance|lineage|stock/i.test(p.title));
  const coverage=activity.actionsSource==="live"&&activity.issuesSource==="live";
  const operational=activity.website.state==="reachable"?"Merespons":activity.website.state==="error"?"HTTP error":"Tak terpantau";
  return <div className="terrace-overview ops-overview">
    <div className="ops-kpis">
      <MiniCard label="PEKERJAAN AKTIF" value={data.githubSource==="live"?`${data.openPrs.length} PR`:"—"} desc={data.githubSource==="live"?"PR GitHub terbuka saat pemeriksaan":"API GitHub PR tidak tersedia"} />
      <MiniCard label="PIPELINE DEVELOPMENT" value={activity.actionsSource==="live"?ciActive? `${ciActive} berjalan` : newest?.conclusion==="failure" ? "Gagal" : newest?.conclusion==="success" ? "CI lulus" : newest?.status||"Belum ada":"—"} desc={activity.actionsSource==="live"?`CI terbaru: ${newest?.branch||"tidak tersedia"}`:"Workflow monitoring belum tersedia"} tone={newest?.conclusion==="failure"?"warning":"neutral"}/>
      <MiniCard label="WEB PRODUKSI / HTTP" value={operational} desc={activity.website.httpCode?`HTTP ${activity.website.httpCode} · ${when(activity.website.checkedAt)}`:"Endpoint tidak dapat diverifikasi"} tone={activity.website.state==="reachable"?"positive":activity.website.state==="error"?"warning":"neutral"} />
      <MiniCard label="TEMUAN GITHUB & CI" value={coverage?`${activity.signals.length} temuan`:"Parsial"} desc={coverage?`${failureCount} CI gagal (72 jam) · ${activity.issueCount} issue terbuka`:"Satu atau lebih sumber belum terhubung"} tone={activity.signals.length?"warning":"neutral"}/>
    </div>

    <div className="ops-middle">
      <article className="panel ops-section ops-development">
        <div className="panel-head"><div><span className="eyebrow">DEVELOPMENT</span><h2>Pekerjaan sedang berjalan</h2></div><span className="ops-source">{sourceTag(data.githubSource)}</span></div>
        <div className="ops-section-body">
          <div className="ops-activity-meta"><span><b>{ciActive}</b> workflow berjalan</span><span>{activity.actionsSource==="live"?`CI diperiksa ${when(activity.checkedAt)}`:"CI belum tersedia"}</span></div>
          {data.openPrs.slice(0,3).map(p=><a key={p.number} href={p.url} target="_blank" rel="noopener noreferrer" className="ops-work-item">
            <span className="ops-pr-num">#{p.number}</span><div><strong>{p.title}</strong><small>Update {when(p.updatedAt)}</small></div><span aria-hidden="true">↗</span>
          </a>)}
          {data.openPrs.length===0 && <div className="ops-empty">{data.githubSource==="live"?"Tidak ada PR terbuka saat pemeriksaan.":"Data PR tidak dapat diperbarui."}</div>}
          <button type="button" className="ops-subtle-button" onClick={onOpenPrs}>Buka PR Tracker →</button>
        </div>
      </article>

      <article className="panel ops-section ops-operations">
        <div className="panel-head"><div><span className="eyebrow">LIVE OPERATIONS</span><h2>Operasional web & infrastruktur</h2></div><span className="ops-source">READ-ONLY</span></div>
        <div className="ops-section-body">
          <div className="ops-operation-line"><div><strong>Public web endpoint</strong><small>Pemeriksaan HTTP, bukan validasi transaksi ERP</small></div><span className={activity.website.state==="reachable"?"ops-state-ok":"ops-state-muted"}>{activity.website.httpCode?`HTTP ${activity.website.httpCode}`:"Tidak tersedia"}</span></div>
          <div className="ops-operation-line"><div><strong>Vercel Production</strong><small>{data.vercel.detail || "Deployment"}</small></div><span className={data.vercel.source==="live"?"ops-state-ok":"ops-state-muted"}>{safeFallback(data.vercel.value,data.vercel.source)} · {sourceTag(data.vercel.source)}</span></div>
          <div className="ops-operation-line"><div><strong>Supabase Production · Tokyo</strong><small>Platform health, bukan konsistensi stok/keuangan</small></div><span className={data.production.source==="live"?"ops-state-ok":"ops-state-muted"}>{safeFallback(data.production.value,data.production.source)} · {sourceTag(data.production.source)}</span></div>
          <div className="ops-operation-line"><div><strong>Supabase Staging · Singapore</strong><small>Environment pengujian</small></div><span className={data.staging.source==="live"?"ops-state-ok":"ops-state-muted"}>{safeFallback(data.staging.value,data.staging.source)} · {sourceTag(data.staging.source)}</span></div>
          <div className="ops-operation-line"><div><strong>Runtime errors & transaksi ERP</strong><small>Butuh telemetri backend dan otorisasi terpisah</small></div><span className="ops-state-muted">Belum terhubung</span></div>
        </div>
      </article>
    </div>

    <article className="panel ops-section ops-alerts">
      <div className="panel-head"><div><span className="eyebrow">TRIAGE / 72 JAM TERAKHIR</span><h2>Bug & error terdeteksi</h2></div><div className="ops-filters">
        <button type="button" className={filter==="all"?"selected":""} onClick={()=>{setFilter("all");setPage(0)}}>Semua</button>
        <button type="button" className={filter==="ci"?"selected":""} onClick={()=>{setFilter("ci");setPage(0)}}>CI gagal</button>
        <button type="button" className={filter==="issue"?"selected":""} onClick={()=>{setFilter("issue");setPage(0)}}>GitHub issues</button>
      </div></div>
      <div className="ops-alert-body">
        <div className="ops-signal-list">
          {displayed.map(x=><SignalRow key={x.id} item={x}/>)}
          {displayed.length===0 && <div className="ops-empty">{coverage?"Tidak ada temuan pada sumber dan filter yang diperiksa; ini bukan jaminan bebas bug.":"Belum ada temuan yang dapat ditampilkan. Sumber yang gagal diperiksa tidak dihitung nol."}</div>}
        </div>
        <div className="ops-bottom-bar">
          <span>{needsReview.length? `${needsReview.length} PR perbaikan butuh review`:"PR perbaikan: "+sourceTag(data.githubSource)} · Runtime error production belum terpantau</span>
          <div className="ops-pager"><button type="button" disabled={safePage===0} onClick={()=>setPage(x=>Math.max(0,x-1))}>‹</button><span>{safePage+1}/{pages}</span><button type="button" disabled={safePage===pages-1} onClick={()=>setPage(x=>Math.min(pages-1,x+1))}>›</button></div>
        </div>
      </div>
    </article>
    <p className="ops-disclaimer">Diperiksa {when(activity.checkedAt)} · CI gagal ≠ gangguan produksi · status snapshot tidak otomatis berarti masih sehat · klik Periksa ulang untuk data terbaru.</p>
  </div>;
}
