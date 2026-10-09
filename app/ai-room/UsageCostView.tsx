import { summarizeUsage, type StoredAiRoomJob } from "@/lib/ai-room-jobs";

type HistorySync = {
  enabled: boolean;
  connected: boolean;
  locked: boolean;
  loading: boolean;
  key: string;
  message: string;
};

function usd(value:number|undefined){
  return value===undefined?"—":`$${value.toFixed(2)}`;
}

function when(job:StoredAiRoomJob){
  if(job.createdAt){
    const date=new Date(job.createdAt);
    if(!Number.isNaN(date.getTime())) return date.toLocaleString([],{dateStyle:"medium",timeStyle:"short"});
  }
  return job.created||"Earlier";
}

export default function UsageCostView({
  jobs,
  historySync,
  onHistoryKeyChange,
  onUnlockHistory,
  onImportBrowserHistory,
  onDisconnectHistory,
}:{
  jobs:StoredAiRoomJob[];
  historySync:HistorySync;
  onHistoryKeyChange:(key:string)=>void;
  onUnlockHistory:()=>void;
  onImportBrowserHistory:()=>void;
  onDisconnectHistory:()=>void;
}){
  const summary=summarizeUsage(jobs);
  const source=historySync.connected?"Server sync":"This browser";
  return <section className="usage-view">
    <div className="usage-cards">
      <article className="usage-stat card"><span>ESTIMATED SPEND</span><strong>{usd(summary.estimatedTotalUsd)}</strong><small>fal.ai estimate · not invoice</small></article>
      <article className="usage-stat card"><span>TOTAL JOBS</span><strong>{summary.jobs}</strong><small>{source}</small></article>
      <article className="usage-stat card"><span>READY</span><strong>{summary.ready}</strong><small>Completed videos</small></article>
      <article className="usage-stat card"><span>FAILED</span><strong>{summary.failed}</strong><small>Terminal failures</small></article>
    </div>

    <section className="queue card history-sync-card">
      <div className="section-head"><div><span className="kicker">HISTORY SYNC</span><h2>{historySync.connected?"Private server history connected":historySync.enabled?"Private server history available":"Browser history active"}</h2></div><span>{historySync.connected?"SYNCED":historySync.enabled?"LOCKED":"LOCAL"}</span></div>
      {!historySync.enabled&&<div className="usage-note">Cross-browser history is prepared but not activated. AI ROOM keeps using local browser storage until a private server store is configured.</div>}
      {historySync.enabled&&!historySync.connected&&<div className="history-unlock">
        <input type="password" value={historySync.key} onChange={event=>onHistoryKeyChange(event.target.value)} placeholder="History sync key" autoComplete="off"/>
        <button disabled={historySync.loading||historySync.key.length<4} onClick={onUnlockHistory}>{historySync.loading?"Connecting…":"Unlock history"}</button>
      </div>}
      {historySync.connected&&<div className="history-connected">
        <span>{historySync.message||"Server history is authoritative on this device."}</span>
        <div><button onClick={onImportBrowserHistory} disabled={historySync.loading}>Import this browser history</button><button onClick={onDisconnectHistory}>Disconnect</button></div>
      </div>}
      {historySync.message&&!historySync.connected&&<div className="usage-note">{historySync.message}</div>}
    </section>

    <section className="queue card usage-card">
      <div className="section-head"><div><span className="kicker">USAGE</span><h2>Generation cost history</h2></div><span>Estimated USD</span></div>
      <div className="usage-note">Estimates use the configured Wan rate card. Actual fal.ai billing may differ. Source: {source}.</div>
      {jobs.length===0?<div className="empty">Usage appears after your first generation.</div>:
        <div className="usage-table-wrap"><table className="usage-table">
          <thead><tr><th>When</th><th>Prompt</th><th>Model</th><th>Mode</th><th>Spec</th><th>Status</th><th>Est. cost</th></tr></thead>
          <tbody>{jobs.map(job=><tr key={job.id}>
            <td>{when(job)}</td>
            <td title={job.prompt}>{job.prompt}</td>
            <td>{job.model}</td>
            <td>{job.mode==="image"?"Image → Video":"Text → Video"}</td>
            <td>{[job.duration,job.quality,job.aspect].filter(Boolean).join(" · ")||"—"}</td>
            <td>{job.status}</td>
            <td>{usd(job.estimatedCostUsd)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </section>;
}
