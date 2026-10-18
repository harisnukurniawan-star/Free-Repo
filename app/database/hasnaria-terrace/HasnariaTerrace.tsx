"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DatabaseSidebar from "@/app/components/DatabaseSidebar";
import type { HasnariaData } from "@/lib/hasnaria-monitoring";
import type { HasnariaActivity } from "@/lib/hasnaria-activity";
import type { HcActivity } from "@/lib/hc-connect-activity";
import ActivityOverview from "./ActivityOverview";

type Section = "overview" | "prs" | "release";
type Scenario = "ui" | "database" | "attendance";
const recentMerged = [
  { number: 94, title: "Optimasi Staff pada jaringan lambat" },
  { number: 93, title: "Percepatan absensi dan GPS Android" },
  { number: 92, title: "Sinkronisasi geofence Owner" },
  { number: 91, title: "Perbaikan GPS dan radius 200 meter" },
  { number: 90, title: "Source guard P0.1–P0.2 dan Owner UI" },
];
export default function HasnariaTerrace({ data, activity, hcActivity }: { data: HasnariaData; activity: HasnariaActivity; hcActivity: HcActivity }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  useEffect(() => { const id = window.setInterval(() => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); }, 120000); return () => window.clearInterval(id); }, [router]);
  const [section, setSection] = useState<Section>("overview");
  const [prView, setPrView] = useState<"open" | "merged">("open");
  const [prPage, setPrPage] = useState(0);
  const [scenario, setScenario] = useState<Scenario>("database");
  const [impact, setImpact] = useState(3);
  const [complexity, setComplexity] = useState(3);
  const [checks, setChecks] = useState([false, false, false, false]);
  const completed = checks.filter(Boolean).length;
  const risk = Math.max(5, Math.min(100, impact * 11 + complexity * 9 + (scenario === "database" ? 15 : scenario === "attendance" ? 10 : 0) + 10 - (checks[0] ? 13 : 0) - (checks[1] ? 16 : 0) - (checks[2] ? 14 : 0) - (checks[3] ? 10 : 0)));
  const level = risk >= 65 ? "Tinggi" : risk >= 35 ? "Sedang" : "Rendah";
  const prItems = prView === "open" ? data.openPrs : recentMerged.map(p => ({
    ...p,
    url: `https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/${p.number}`,
    state: "merged" as const,
    updatedAt: "",
  }));
  const prPageCount = Math.max(1, Math.ceil(prItems.length / 4));
  const safePrPage = Math.min(prPage, prPageCount - 1);
  const displayedPrs = prItems.slice(safePrPage * 4, (safePrPage + 1) * 4);
  return (
    <main className="control-room terrace-one-view">
      <DatabaseSidebar mode="hasnaria" />
      <section className="workspace terrace-workspace">
        <header className="topbar terrace-topbar">
          <div><span className="eyebrow">DATABASE / HASNARIA ERP</span><h1>Hasnaria Terrace</h1><p>Project Intelligence · Monitoring, delivery, dan evaluasi rilis</p></div>
          <div className="top-actions">
            <span className="terrace-zoom-label">ONE VIEW · 100%</span>
            <span className="terrace-readonly">◉ Read-only</span>
            <button type="button" className="refresh-button" disabled={busy} onClick={() => startTransition(() => router.refresh())}>{busy ? "Memeriksa…" : "↻ Periksa ulang"}</button>
          </div>
        </header>
        <div className="info-banner">Sumber ditandai secara eksplisit: Live saat dimuat atau Snapshot 18 Okt 2026. Status deployment/health bukan pengganti UAT, audit keamanan, dan pemeriksaan data bisnis.</div>
        <div className="terrace-tabs" role="tablist" aria-label="Hasnaria monitoring sections">
          {[["overview","Overview"],["prs","Pull Requests"],["release","Release Gate"]].map(([id,title])=>
            <button key={id} type="button" role="tab" aria-selected={section===id} className={section===id?"selected":""} onClick={()=>setSection(id as Section)}>{title}</button>
          )}
        </div>
        <div className="terrace-content">
        {section === "overview" && <ActivityOverview activity={activity} data={data} hcActivity={hcActivity} onOpenPrs={() => setSection("prs")} />}
        {section === "prs" && <article className="panel terrace-panel terrace-pr-panel">
          <div className="panel-head"><div><span className="eyebrow">GITHUB / DELIVERY</span><h2>Pull Request Tracker</h2></div><span className="terrace-tag terrace-static">{data.openPrs.length} Open</span></div>
          <div className="terrace-panel-body terrace-pr-body">
            <div className="terrace-switch">
              <button type="button" className={prView==="open"?"selected":""} onClick={()=>{setPrView("open");setPrPage(0);}}>Terbuka</button>
              <button type="button" className={prView==="merged"?"selected":""} onClick={()=>{setPrView("merged");setPrPage(0);}}>Merged (snapshot)</button>
            </div>
            <p className="terrace-footnote">{prView==="open"?data.githubNote:"Daftar PR merged merupakan snapshot pilihan per 18 Oktober 2026, bukan daftar live."}</p>
            <div className="terrace-pr-list">
            {displayedPrs.map((pr)=>
              <div className="terrace-pr" key={pr.number}>
                <div><strong>#{pr.number} · {pr.title}</strong><small>{pr.state === "merged" ? "Merged · riwayat" : "Open · perlu review"}</small></div>
                <a href={pr.url} target="_blank" rel="noopener noreferrer" aria-label={`Open pull request ${pr.number} on GitHub`}>Buka ↗</a>
              </div>
            )}
            {prView==="open" && data.openPrs.length === 0 && <p className="terrace-text">Tidak ada PR terbuka yang dikembalikan API.</p>}
            </div>
            <div className="terrace-pr-pager" aria-label="Navigasi halaman pull request">
              <button type="button" disabled={safePrPage === 0} onClick={()=>setPrPage(p=>Math.max(0,p-1))}>← Sebelumnya</button>
              <span>Halaman {safePrPage + 1} / {prPageCount} · {prItems.length} PR</span>
              <button type="button" disabled={safePrPage >= prPageCount-1} onClick={()=>setPrPage(p=>Math.min(prPageCount-1,p+1))}>Berikutnya →</button>
            </div>
          </div>
        </article>}
        {section === "release" && <section className="terrace-two-cols terrace-release">
          <article className="panel terrace-panel">
            <div className="panel-head"><div><span className="eyebrow">SANDBOX</span><h2>Simulasi risiko rilis</h2></div></div>
            <div className="terrace-panel-body terrace-form">
              <label htmlFor="terrace-scenario">Jenis perubahan</label>
              <select id="terrace-scenario" value={scenario} onChange={e=>setScenario(e.target.value as Scenario)}><option value="ui">Frontend / UI</option><option value="database">Database / migrasi</option><option value="attendance">Absensi / GPS</option></select>
              <label htmlFor="terrace-impact">Dampak perubahan <strong>{impact}/5</strong></label><input id="terrace-impact" type="range" min="1" max="5" value={impact} onChange={e=>setImpact(Number(e.target.value))}/>
              <label htmlFor="terrace-complexity">Kompleksitas <strong>{complexity}/5</strong></label><input id="terrace-complexity" type="range" min="1" max="5" value={complexity} onChange={e=>setComplexity(Number(e.target.value))}/>
              <div className="terrace-risk"><span>Indeks risiko heuristik</span><strong>{risk}/100 · {level}</strong><div className="terrace-risk-track"><div style={{width:`${risk}%`,background:risk>=65?"#ef4444":risk>=35?"#f59e0b":"#16a34a"}}/></div></div>
              <small>Model simulasi, bukan probabilitas atau persetujuan deploy otomatis.</small>
            </div>
          </article>
          <article className="panel terrace-panel">
            <div className="panel-head"><div><span className="eyebrow">RELEASE CONTROL</span><h2>Gate & Recovery</h2></div><strong className="terrace-gate-count">{completed}/4</strong></div>
            <div className="terrace-panel-body terrace-form">
              <p className="terrace-footnote">Centang untuk SIMULASI bukti yang terpenuhi. Checklist tidak terhubung dengan CI/UAT/backup sebenarnya.</p>
              {["CI dan tests lolos","UAT staging lolos","Backup + restore teruji","Rollback plan teruji"].map((name,i)=><label key={name} className="terrace-check"><input type="checkbox" checked={checks[i]} onChange={e=>setChecks(c=>c.map((v,j)=>i===j?e.target.checked:v))}/>{name}</label>)}
              <div className="terrace-decision">{completed===4&&risk<35?"Layak untuk evaluasi manual rilis":completed===4?"Perlu review risiko tambahan":"Belum layak disetujui untuk rilis"}</div>
              <p className="terrace-text">{scenario==="database"?"Mitigasi: uji lineage di staging dan siapkan restore database independen; rollback frontend tidak membatalkan migrasi SQL.":scenario==="attendance"?"Mitigasi: uji iPhone/Android fisik dan fallback GPS; pertahankan histori absensi.":"Mitigasi: uji preview dan smoke test; siapkan rollback ke deployment stabil."}</p>
              <button type="button" className="refresh-button" onClick={()=>{setScenario("database");setImpact(3);setComplexity(3);setChecks([false,false,false,false])}}>Reset simulasi</button>
            </div>
          </article>
        </section>}
        </div>
        <footer className="terrace-footer">Monitoring bersifat read-only. Tidak melakukan perubahan GitHub, Vercel, ataupun Supabase. <a href="https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream" target="_blank" rel="noopener noreferrer">Repository Hasnaria ↗</a></footer>
      </section>
    </main>
  );
}
