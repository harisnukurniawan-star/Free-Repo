"use client";

import { useState } from "react";
import type { HcActivity } from "@/lib/hc-connect-activity";
import type { HasnariaActivity } from "@/lib/hasnaria-activity";
import type { HasnariaData, Status } from "@/lib/hasnaria-monitoring";
import type { DbOverview } from "@/types/database";

export type VisualState = "ok" | "warning" | "bad" | "unknown";
export type VisualSource = "live" | "snapshot" | "unavailable";
export type ArchitectureNode = {
  id: string;
  title: string;
  sub: string;
  info: string;
  state: VisualState;
  source: VisualSource;
  checkedAt: string;
  detail: string;
  href: string;
};

type Props = {
  hc: HcActivity;
  hasnaria: HasnariaActivity;
  hasData: HasnariaData;
  oci?: DbOverview | null;
};

function labelState(source: VisualSource, state: VisualState) {
  if (source === "snapshot") return "SNAPSHOT";
  if (source === "unavailable") return "UNVERIFIED";
  return state === "ok" ? "ONLINE" : state === "bad" ? "ERROR" : state === "warning" ? "WARNING" : "CHECKED";
}
function timeId(v: string) {
  if (!v || !Number.isFinite(Date.parse(v))) return "Tidak ada waktu pemeriksaan";
  return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(v))+" WIB";
}
function databaseStatus(label: string, sub: string, status: Status, href: string): ArchitectureNode {
  const healthy = status.value === "ACTIVE_HEALTHY";
  return { id:label, title:label, sub, info:status.source === "unavailable" ? "Belum terhubung" : status.value,
    state:status.source === "snapshot" ? "warning" : status.source === "unavailable" ? "unknown" : healthy ? "ok" : "bad",
    source:status.source, checkedAt:status.checkedAt,
    detail:status.source === "snapshot" ? "Status tersimpan dari pemeriksaan lalu; bukan bukti database sehat sekarang." : status.source === "live" ? "Metadata manajemen Supabase diperiksa saat halaman dimuat; konsistensi transaksi belum diuji." : "Manajemen Supabase belum dapat dibaca.",
    href };
}
export function buildArchitectureNodes({hc,hasnaria,hasData,oci}:Props):{hc:ArchitectureNode[];has:ArchitectureNode[]} {
  const hcGitLive=hc.github.prsSource === "live";
  const hcPrs=hc.github.prs.length;
  const hcWeb=hc.website;
  const hcMonitor=hc.github.runs.find(r=>/latency watch/i.test(r.name));
  const hcBackup=hc.github.runs.find(r=>/backup monitor/i.test(r.name));
  const hGitLive=hasData.githubSource === "live";
  const hasPrs=hasData.openPrs.length;
  const deploy=hc.vercel.production;
  const hcNodes:ArchitectureNode[] = [
    {id:"hc-github",title:"GitHub",sub:"hcbp-hub · main",
      info:hc.github.prsSource === "unavailable" ? "PR tidak tersedia" : hcPrs+" PR terbuka",
      source:hc.github.prsSource,
      state:hc.github.prsSource==="unavailable" ? "unknown" : hcGitLive && hcPrs===0 ? "ok" : "warning",
      checkedAt:hc.github.prsSource==="snapshot" ? "2026-10-18T08:06:20Z" : hc.checkedAt,
      detail:(hcGitLive?"PR diperiksa dari GitHub. ":"PR menggunakan snapshot 18 Oktober; ")+"PR terbuka adalah backlog, bukan konfirmasi error produksi.",
      href:"https://github.com/jakgunn20-maker/hcbp-hub/pulls"},
    {id:"hc-vercel",title:"Vercel",sub:"hc-connect · production",
      info:hc.vercel.source==="live" && deploy ? deploy.state : "Status belum terhubung",
      source:hc.vercel.source,state:hc.vercel.source!=="live"||!deploy?"unknown":deploy.state==="READY"?"ok":deploy.state==="ERROR"?"bad":"warning",
      checkedAt:deploy?.at||hc.checkedAt,
      detail:hc.vercel.source==="live" ? "Status deployment Vercel terverifikasi; tidak membuktikan semua fitur website normal." : "Perlu HC_CONNECT_VERCEL_TOKEN pada backend Control Room.",
      href:"https://vercel.com/jakgunn20-4556s-projects/hc-connect"},
    {id:"hc-website",title:"Web App",sub:"hcconnect.site",
      info:hcWeb.code?"HTTP "+hcWeb.code:"HTTP tidak tersedia",
      source:hcWeb.state==="unavailable"?"unavailable":"live",
      state:hcWeb.state==="online"?"ok":hcWeb.state==="error"?"bad":"unknown",checkedAt:hcWeb.checkedAt,
      detail:"Hanya pemeriksaan HTTP homepage; login, transaksi, dan workflow belum otomatis diuji.",
      href:"https://hcconnect.site/"},
    {id:"hc-oci",title:"OCI HeatWave",sub:"DB · Function · Backup",
      info:oci?.mode==="snapshot"?"DB SNAPSHOT":oci?.connected?"Metadata tersedia":hcMonitor?.conclusion==="success"?"Monitor sukses":"Belum tervalidasi",
      source:oci?.mode==="snapshot"?"snapshot":oci?.connected?"live":hc.github.runsSource==="snapshot"?"snapshot":"unavailable",
      state:oci?.mode==="snapshot"?"warning":oci?.connected?"ok":"unknown",
      checkedAt:oci?.checkedAt||hcMonitor?.at||hc.checkedAt,
      detail:"Metadata OCI dan laporan backup/latency adalah sumber terpisah. "+(hcMonitor?"Latency watch: "+hcMonitor.conclusion+". ":"Latency watch belum diverifikasi. ")+(hcBackup?"Backup monitor: "+hcBackup.conclusion+".":"Backup monitor belum diverifikasi.")+" Keberhasilan workflow tidak menjamin kesehatan database saat ini.",
      href:"https://github.com/jakgunn20-maker/hcbp-hub/actions"},
  ];
  const hWebsite=hasnaria.website;
  const hNodes:ArchitectureNode[]=[
    {id:"has-github",title:"GitHub",sub:"Hasnaria-ice-cream · main",
      info:hasData.githubSource==="unavailable"?"PR tidak tersedia":hasPrs+" PR terbuka",
      source:hasData.githubSource,state:hasData.githubSource==="unavailable"?"unknown":hGitLive&&hasPrs===0?"ok":"warning",
      checkedAt:hasData.githubSource==="snapshot"?"2026-10-18T03:25:22Z":hasData.checkedAt,
      detail:(hGitLive?"Dibaca dari GitHub. ":"Snapshot historis 18 Oktober. ")+"Backlog PR tidak otomatis menandakan aplikasi down.",
      href:"https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pulls"},
    {id:"has-vercel",title:"Vercel",sub:"Business Analyzer · production",
      info:hasData.vercel.source==="unavailable"?"Belum diverifikasi":hasData.vercel.value,
      source:hasData.vercel.source,
      state:hasData.vercel.source==="snapshot"?"warning":hasData.vercel.source==="unavailable"?"unknown":hasData.vercel.value==="READY"?"ok":hasData.vercel.value==="ERROR"?"bad":"warning",
      checkedAt:hasData.vercel.checkedAt,
      detail:hasData.vercel.source==="snapshot"?"Status READY berasal dari snapshot lalu. Tidak berarti sekarang READY.":hasData.vercel.source==="live"?"Dibaca dari API Vercel; runtime dan jalur transaksi belum teruji.":"API Vercel belum terhubung.",
      href:"https://vercel.com/ekariashoesanti-9951s-projects/hasnaria-business-analyzer"},
    {id:"has-web",title:"Web App",sub:"Hasnaria Business Analyzer",
      info:hWebsite.httpCode?"HTTP "+hWebsite.httpCode:"HTTP tidak tersedia",
      source:hWebsite.state==="unavailable"?"unavailable":"live",
      state:hWebsite.state==="reachable"?"ok":hWebsite.state==="error"?"bad":"unknown",
      checkedAt:hWebsite.checkedAt,
      detail:"Probe website hanya memeriksa HTTP. Penyimpanan transaksi dan rendering halaman tidak diverifikasi.",
      href:"https://hasnaria-business-analyzer.vercel.app/"},
    databaseStatus("Supabase Tokyo","Production DB",hasData.production,"https://supabase.com/dashboard/project/bnnhmtkpdjlgehsvgoda"),
    databaseStatus("Supabase Singapore","Staging DB",hasData.staging,"https://supabase.com/dashboard/project/rynnpndtzjwpekbiwiif"),
  ];
  return {hc:hcNodes,has:hNodes};
}

function NodeBox({node,onSelect,selected}:{node:ArchitectureNode;onSelect:(node:ArchitectureNode)=>void;selected:boolean}) {
  return <button type="button" className={"live-arch-node live-arch-"+node.state+(selected?" is-selected":"")} onClick={()=>onSelect(node)} aria-pressed={selected} title={"Detail "+node.title}>
    <span className="live-arch-node-top"><strong>{node.title}</strong><span className="live-arch-dot" aria-hidden="true"/></span>
    <small>{node.sub}</small>
    <span className="live-arch-node-status">{labelState(node.source,node.state)}</span>
    <em>{node.info}</em>
  </button>;
}
function ProjectDiagram({title,items,selected,onSelect,summary}:{title:string;items:ArchitectureNode[];selected:string;onSelect:(node:ArchitectureNode)=>void;summary:string}) {
  const hc=items.length===4;
  return <article className="live-arch-card">
    <div className="live-arch-card-head"><strong>{title}</strong><span>DIAGRAM STATUS · READ ONLY</span></div>
    <div className={"live-arch-track "+(hc?"live-arch-track-hc":"live-arch-track-has")}>
      <NodeBox node={items[0]} onSelect={onSelect} selected={selected===items[0].id}/>
      <span className="live-arch-arrow" aria-hidden="true">→</span>
      <NodeBox node={items[1]} onSelect={onSelect} selected={selected===items[1].id}/>
      <span className="live-arch-arrow" aria-hidden="true">→</span>
      <div className="live-arch-tail">
        <NodeBox node={items[2]} onSelect={onSelect} selected={selected===items[2].id}/>
        <span className="live-arch-arrow" aria-hidden="true">{hc?"→":"↳"}</span>
        {hc?<NodeBox node={items[3]} onSelect={onSelect} selected={selected===items[3].id}/>:<div className="live-arch-stack">
          <NodeBox node={items[3]} onSelect={onSelect} selected={selected===items[3].id}/>
          <NodeBox node={items[4]} onSelect={onSelect} selected={selected===items[4].id}/>
        </div>}
      </div>
    </div>
    <p>{summary}</p>
  </article>;
}

export default function ArchitectureLiveStatus(props:Props) {
  const [selected,setSelected]=useState("");
  const nodes=buildArchitectureNodes(props);
  const all=[...nodes.hc,...nodes.has];
  const chosen=all.find(n=>n.id===selected);
  const backlog=nodes.hc[0].info+" · "+nodes.has[0].info;
  const hcFailures=props.hc.signals.filter(s=>s.category==="error").length;
  const hasCiFailures=props.hasnaria.signals.filter(s=>s.kind==="ci").length;
  const hcSummary="Sinyal error: "+(props.hc.github.runsSource==="live"?hcFailures:"belum terverifikasi")+
    " · issue: "+(props.hc.github.issuesSource==="live"?props.hc.github.issuesCount:"belum terverifikasi")+" · runtime belum terhubung";
  const hasSummary="CI gagal (72 jam): "+(props.hasnaria.actionsSource==="live"?hasCiFailures:"belum terverifikasi")+
    " · issue: "+(props.hasnaria.issuesSource==="live"?props.hasnaria.issueCount:"belum terverifikasi")+" · runtime belum terhubung";
  return <section className="live-arch" aria-label="Architecture and online live status report">
    <div className="live-arch-pair">
      <ProjectDiagram title="HC Connect" summary={hcSummary} items={nodes.hc} onSelect={n=>setSelected(n.id===selected?"":n.id)} selected={selected}/>
      <ProjectDiagram title="Hasnaria Terrace" summary={hasSummary} items={nodes.has} onSelect={n=>setSelected(n.id===selected?"":n.id)} selected={selected}/>
    </div>
    <div className="live-arch-foot">
      <div className="live-arch-legend" aria-label="Legenda status">
        <span><i className="live-arch-dot live-arch-ok"/>Online/ready diperiksa</span>
        <span><i className="live-arch-dot live-arch-warning"/>Peringatan/snapshot</span>
        <span><i className="live-arch-dot live-arch-bad"/>Error terpantau</span>
        <span><i className="live-arch-dot live-arch-unknown"/>Belum diverifikasi</span>
      </div>
      <span>Backlog GitHub: {backlog} · bukan bukti bug runtime</span>
    </div>
    {chosen&&<div className="live-arch-detail" role="status">
      <strong>{chosen.title} · {labelState(chosen.source,chosen.state)}</strong>
      <span>{chosen.detail} · Diperiksa: {timeId(chosen.checkedAt)}</span>
      <a href={chosen.href} target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>
    </div>}
  </section>;
}
