"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DatabaseSidebar from "@/app/components/DatabaseSidebar";
import type { HasnariaData, Source, Status } from "@/lib/hasnaria-monitoring";

type Section = "overview" | "prs" | "release";
type Scenario = "ui" | "database" | "attendance";
const recentMerged = [
  { number: 94, title: "Optimasi Staff pada jaringan lambat" },
  { number: 93, title: "Percepatan absensi dan GPS Android" },
  { number: 92, title: "Sinkronisasi geofence Owner" },
  { number: 91, title: "Perbaikan GPS dan radius 200 meter" },
  { number: 90, title: "Source guard P0.1–P0.2 dan Owner UI" },
];
const tag = (source: Source) => source === "live" ? "Live saat dimuat" : source === "snapshot" ? "Snapshot 18 Okt" : "Tidak tersedia";
function StatusCard({ label, status, note }: { label: string; status: Status; note: string }) {
  return <article className="terrace-card">
    <div className="terrace-card-head"><span>{label}</span><span className={`terrace-tag ${status.source === "live" ? "terrace-live" : "terrace-static"}`}>{tag(status.source)}</span></div>
    <strong>{status.value}</strong><small>{status.detail || note}</small>
  </article>;
}
export default function HasnariaTerrace({ data }: { data: HasnariaData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [section, setSection] = useState<Section>("overview");
  const [environment, setEnvironment] = useState<"production" | "staging">("production");
  const [prView, setPrView] = useState<"open" | "merged">("open");
  const [scenario, setScenario] = useState<Scenario>("database");
  const [impact, setImpact] = useState(3);
  const [complexity, setComplexity] = useState(3);
  const [checks, setChecks] = useState([false, false, false, false]);
  const completed = checks.filter(Boolean).length;
  const risk = Math.max(5, Math.min(100, impact * 11 + complexity * 9 + (scenario === "database" ? 15 : scenario === "attendance" ? 10 : 0) + 10 - (checks[0] ? 13 : 0) - (checks[1] ? 16 : 0) - (checks[2] ? 14 : 0) - (checks[3] ? 10 : 0)));
  const level = risk >= 65 ? "Tinggi" : risk >= 35 ? "Sedang" : "Rendah";
  const activeDb = environment === "production" ? data.production : data.staging;
  const activeId = environment === "production" ? "bnnhmtkpdjlgehsvgoda" : "rynnpndtzjwpekbiwiif";
  return (
    <main className="control-room">
      <DatabaseSidebar mode="hasnaria" />
      <section className="workspace terrace-workspace">
        <header className="topbar terrace-topbar">
          <div><span className="eyebrow">DATABASE / HASNARIA ERP</span><h1>Hasnaria Terrace</h1><p>Project Intelligence · Monitoring, delivery, dan evaluasi rilis</p></div>
          <div className="top-actions">
            <span className="terrace-readonly">◉ Read-only</span>
            <button type="button" className="refresh-button" disabled={busy} onClick={() => startTransition(() => router.refresh())}>{busy ? "Memeriksa…" : "↻ Periksa ulang"}</button>
          </div>
        </header>
        <div className="info-banner">Sumber ditandai secara eksplisit: Live saat dimuat atau Snapshot 18 Okt 2026. Status deployment/health bukan pengganti UAT, audit keamanan, dan pemeriksaan data bisnis.</div>
        <div className="terrace-tabs" role="tablist" aria-label="Hasnaria monitoring sections">
          {[["overview","Infrastructure"],["prs","Pull Requests"],["release","Release Gate"]].map(([id,title])=>
            <button key={id} type="button" role="tab" aria-selected={section===id} className={section===id?"selected":""} onClick={()=>setSection(id as Section)}>{title}</button>
          )}
        </div>
        {section === "overview" && <>
          <section className="terrace-metrics" aria-label="Hasnaria services">
            <StatusCard label="GitHub" status={{value:"main",source:data.githubSource,checkedAt:data.checkedAt,detail:data.githubNote}} note="Branch utama" />
            <StatusCard label="Vercel Production" status={data.vercel} note="hasnaria-business-analyzer" />
            <StatusCard label="Supabase Production" status={data.production} note="Tokyo" />
            <StatusCard label="Supabase Staging" status={data.staging} note="Singapore" />
          </section>
          <section className="terrace-two-cols">
            <article className="panel terrace-panel">
              <div className="panel-head"><div><span className="eyebrow">TOPOLOGY</span><h2>Application Architecture</h2></div></div>
              <div className="terrace-flow">
                <div><strong>GitHub</strong><small>Hasnaria-ice-cream · main</small></div>
                <span aria-hidden="true">→</span><div><strong>Vercel</strong><small>Business Analyzer</small></div>
                <span aria-hidden="true">→</span><div><strong>Supabase</strong><small>Tokyo / Singapore</small></div>
              </div>
              <p className="terrace-footnote">Peta konseptual; jalur koneksi runtime dan isolasi konfigurasi harus diuji secara terpisah.</p>
            </article>
            <article className="panel terrace-panel">
              <div className="panel-head"><div><span className="eyebrow">ENVIRONMENT</span><h2>Database Health</h2></div></div>
              <div className="terrace-panel-body">
                <div className="terrace-switch">
                  <button type="button" className={environment==="production"?"selected":""} onClick={()=>setEnvironment("production")}>Production · Tokyo</button>
                  <button type="button" className={environment==="staging"?"selected":""} onClick={()=>setEnvironment("staging")}>Staging · Singapore</button>
                </div>
                <div className="terrace-db-row"><span>{activeDb.value}</span><span className={`terrace-tag ${activeDb.source === "live"?"terrace-live":"terrace-static"}`}>{tag(activeDb.source)}</span></div>
                <div className="terrace-id">Project ID: {activeId}</div>
                <p className="terrace-footnote">{activeDb.detail || "Metadata platform belum tersedia."}</p>
              </div>
            </article>
          </section>
          <article className="panel terrace-panel">
            <div className="panel-head"><div><span className="eyebrow">WORKSTREAM</span><h2>Perhatian prioritas</h2></div></div>
            <div className="terrace-panel-body">
              <p className="terrace-text">Pantau proteksi relasi Purchase–Stock, review rendering Finance, dan bukti UAT. Status platform sehat tidak membuktikan konsistensi seluruh transaksi ERP.</p>
              <button type="button" className="terrace-primary" onClick={()=>setSection("prs")}>Periksa pekerjaan terbuka →</button>
            </div>
          </article>
        </>}
        {section === "prs" && <article className="panel terrace-panel">
          <div className="panel-head"><div><span className="eyebrow">GITHUB / DELIVERY</span><h2>Pull Request Tracker</h2></div><span className="terrace-tag terrace-static">{data.openPrs.length} Open</span></div>
          <div className="terrace-panel-body">
            <div className="terrace-switch">
              <button className={prView==="open"?"selected":""} onClick={()=>setPrView("open")}>Terbuka</button>
              <button className={prView==="merged"?"selected":""} onClick={()=>setPrView("merged")}>Merged (snapshot)</button>
            </div>
            <p className="terrace-footnote">{prView==="open"?data.githubNote:"Daftar PR merged merupakan snapshot pilihan per 18 Oktober 2026, bukan daftar live."}</p>
            {(prView === "open" ? data.openPrs : recentMerged.map(p=>({...p,url:`https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/${p.number}`,state:"merged" as const,updatedAt:""}))).map((pr)=>
              <div className="terrace-pr" key={pr.number}>
                <div><strong>#{pr.number} · {pr.title}</strong><small>{pr.state === "merged" ? "Merged · riwayat" : "Open · perlu review"}</small></div>
                <a href={pr.url} target="_blank" rel="noopener noreferrer" aria-label={`Open pull request ${pr.number} on GitHub`}>Buka ↗</a>
              </div>
            )}
            {prView==="open" && data.openPrs.length === 0 && <p className="terrace-text">Tidak ada PR terbuka yang dikembalikan API.</p>}
          </div>
        </article>}
        {section === "release" && <section className="terrace-two-cols">
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
        <footer className="terrace-footer">Monitoring bersifat read-only. Tidak melakukan perubahan GitHub, Vercel, ataupun Supabase. <a href="https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream" target="_blank" rel="noopener noreferrer">Repository Hasnaria ↗</a></footer>
      </section>
    </main>
  );
}
