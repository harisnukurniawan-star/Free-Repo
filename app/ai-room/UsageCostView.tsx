import { summarizeUsage, type StoredAiRoomJob } from "@/lib/ai-room-jobs";

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

export default function UsageCostView({jobs}:{jobs:StoredAiRoomJob[]}){
  const summary=summarizeUsage(jobs);
  return <section className="usage-view">
    <div className="usage-cards">
      <article className="usage-stat card"><span>ESTIMATED SPEND</span><strong>{usd(summary.estimatedTotalUsd)}</strong><small>fal.ai estimate · not invoice</small></article>
      <article className="usage-stat card"><span>TOTAL JOBS</span><strong>{summary.jobs}</strong><small>This browser</small></article>
      <article className="usage-stat card"><span>READY</span><strong>{summary.ready}</strong><small>Completed videos</small></article>
      <article className="usage-stat card"><span>FAILED</span><strong>{summary.failed}</strong><small>Terminal failures</small></article>
    </div>
    <section className="queue card usage-card">
      <div className="section-head"><div><span className="kicker">USAGE</span><h2>Generation cost history</h2></div><span>Estimated USD</span></div>
      <div className="usage-note">Estimates use the current configured Wan rate card. Actual fal.ai billing may differ. Server-side cross-browser history is not enabled yet.</div>
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
