"use client";
import { useMemo, useState } from "react";

type Mode = "text" | "image";
type Job = { id:string; prompt:string; model:string; status:"Queued"|"Ready"; created:string };

export default function Home(){
  const [mode,setMode]=useState<Mode>("text");
  const [prompt,setPrompt]=useState("");
  const [model,setModel]=useState("Wan 2.2 Fast");
  const [duration,setDuration]=useState("5s");
  const [ratio,setRatio]=useState("16:9");
  const [quality,setQuality]=useState("720p");
  const [jobs,setJobs]=useState<Job[]>([]);
  const canGenerate=prompt.trim().length>=3;
  const estimate=useMemo(()=>model.includes("Fast")?"Low":model.includes("14B")?"Medium":"Premium",[model]);
  function generate(){
    if(!canGenerate)return;
    setJobs(j=>[{id:crypto.randomUUID(),prompt:prompt.trim(),model,status:"Queued",created:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})},...j]);
    setPrompt("");
  }
  return <main className="ai-shell">
    <aside className="ai-side">
      <div className="ai-brand"><div className="ai-logo">A</div><div><strong>AI ROOM</strong><span>Video Studio</span></div></div>
      <nav className="ai-nav"><button className="active">✦ <span>Generate</span></button><button>▣ <span>Gallery</span></button><button>◷ <span>History</span></button></nav>
      <div className="engine"><i/><div><strong>Engine ready</strong><span>Provider adapter mode</span></div></div>
    </aside>
    <section className="ai-main">
      <header><div><span className="kicker">AI VIDEO GENERATOR</span><h1>Create a video</h1><p>Describe the scene. AI ROOM handles the generation workflow.</p></div><div className="badge">MVP · WAN READY</div></header>
      <div className="studio-grid">
        <section className="composer card">
          <div className="tabs"><button onClick={()=>setMode("text")} className={mode==="text"?"active":""}>Text → Video</button><button onClick={()=>setMode("image")} className={mode==="image"?"active":""}>Image → Video</button></div>
          {mode==="image"&&<label className="drop"><input type="file" accept="image/*"/><b>＋ Add reference image</b><span>JPG, PNG or WEBP</span></label>}
          <label className="field"><span>Prompt</span><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="A cinematic night scene, soft light, natural camera movement..."/></label>
          <div className="options">
            <label><span>Model</span><select value={model} onChange={e=>setModel(e.target.value)}><option>Wan 2.2 Fast</option><option>Wan 2.2 14B</option><option>Premium (coming soon)</option></select></label>
            <label><span>Duration</span><select value={duration} onChange={e=>setDuration(e.target.value)}><option>5s</option><option>10s</option></select></label>
            <label><span>Aspect</span><select value={ratio} onChange={e=>setRatio(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
            <label><span>Quality</span><select value={quality} onChange={e=>setQuality(e.target.value)}><option>480p</option><option>720p</option></select></label>
          </div>
          <div className="generate-row"><div><small>Estimated compute</small><strong>{estimate} · {duration} · {quality}</strong></div><button className="generate" disabled={!canGenerate} onClick={generate}>Generate video ✦</button></div>
        </section>
        <aside className="preview card"><div className="preview-box"><div className="play">▶</div><strong>Your video appears here</strong><span>Generate a clip to preview it.</span></div><div className="preview-meta"><span>{model}</span><span>{ratio}</span><span>{duration}</span><span>{quality}</span></div></aside>
      </div>
      <section className="queue card"><div className="section-head"><div><span className="kicker">QUEUE</span><h2>Recent generations</h2></div><span>{jobs.length} jobs</span></div>
        {jobs.length===0?<div className="empty">No generations yet. Your first job will appear here.</div>:jobs.map(j=><div className="job" key={j.id}><div className="thumb">✦</div><div><strong>{j.prompt}</strong><span>{j.model} · {j.created}</span></div><b>{j.status}</b></div>)}
      </section>
    </section>
  </main>
}