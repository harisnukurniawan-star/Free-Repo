"use client";
import { useEffect, useMemo, useState } from "react";

type Mode="text"|"image";
type View="generate"|"gallery"|"history";
type Job={id:string;prompt:string;model:string;status:"Queued"|"Processing"|"Ready"|"Failed";created:string;videoUrl?:string};
type ProviderState={checked:boolean;provider:string;realGeneration:boolean};

export default function Home(){
  const [mode,setMode]=useState<Mode>("text");
  const [view,setView]=useState<View>("generate");
  const [prompt,setPrompt]=useState("");
  const [model,setModel]=useState("Wan 2.2 Fast");
  const [duration,setDuration]=useState("5s");
  const [ratio,setRatio]=useState("16:9");
  const [quality,setQuality]=useState("720p");
  useEffect(()=>{if(model.includes("Fast")&&duration==="10s")setDuration("5s")},[model,duration]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [hydrated,setHydrated]=useState(false);
  const [referenceImage,setReferenceImage]=useState("");
  const [referenceName,setReferenceName]=useState("");
  const [imageError,setImageError]=useState("");
  const [providerState,setProviderState]=useState<ProviderState>({checked:false,provider:"development",realGeneration:false});

  useEffect(()=>{try{const saved=localStorage.getItem("ai-room-jobs");if(saved){const parsed=JSON.parse(saved) as Job[];setJobs(parsed.map(j=>j.status==="Ready"&&!j.videoUrl?{...j,status:"Failed" as const}:j))}}finally{setHydrated(true)}},[]);
  useEffect(()=>{let active=true;fetch("/api/health").then(async response=>{const data=await response.json();if(active)setProviderState({checked:true,provider:data.provider||"unknown",realGeneration:Boolean(data.realGeneration)})}).catch(()=>{if(active)setProviderState({checked:true,provider:"unavailable",realGeneration:false})});return()=>{active=false}},[]);
  useEffect(()=>{if(hydrated)localStorage.setItem("ai-room-jobs",JSON.stringify(jobs.slice(0,50)))},[jobs,hydrated]);

  useEffect(()=>{
    if(!providerState.realGeneration)return;
    const pending=jobs.filter(j=>j.status==="Queued"||j.status==="Processing");
    if(!pending.length)return;
    const timer=setTimeout(async()=>{
      for(const item of pending){
        try{
          const response=await fetch(`/api/generate/${encodeURIComponent(item.id)}`);
          const data=await response.json();
          if(!response.ok||!data.job)continue;
          const status:Job["status"]=data.job.status==="completed"?"Ready":data.job.status==="processing"?"Processing":data.job.status==="failed"?"Failed":"Queued";
          setJobs(current=>current.map(j=>j.id===item.id?{...j,status,videoUrl:data.job.videoUrl||j.videoUrl}:j));
        }catch{}
      }
    },2500);
    return()=>clearTimeout(timer);
  },[jobs,providerState.realGeneration]);

  const canGenerate=providerState.realGeneration&&prompt.trim().length>=3&&(mode==="text"||!!referenceImage);
  const readyVideo=jobs.find(j=>j.videoUrl)?.videoUrl;
  const completedJobs=jobs.filter(j=>j.videoUrl);
  const estimate=useMemo(()=>model.includes("Fast")?"Low":model.includes("14B")?"Medium":"Premium",[model]);

  function onReferenceImage(file?:File){
    setImageError("");
    if(!file){setReferenceImage("");setReferenceName("");return}
    const allowed=["image/jpeg","image/png","image/webp"];
    if(!allowed.includes(file.type)){setImageError("Use JPG, PNG, or WEBP.");setReferenceImage("");setReferenceName("");return}
    if(file.size>2_500_000){setImageError("Reference image must be 2.5 MB or smaller.");setReferenceImage("");setReferenceName("");return}
    const reader=new FileReader();
    reader.onload=()=>{if(typeof reader.result==="string"){setReferenceImage(reader.result);setReferenceName(file.name)}};
    reader.onerror=()=>setImageError("Could not read the reference image.");
    reader.readAsDataURL(file);
  }

  async function generate(){
    if(!canGenerate||submitting)return;
    const submittedPrompt=prompt.trim();
    setSubmitting(true);setError("");
    try{
      const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:submittedPrompt,mode,model,duration,aspect:ratio,quality,imageUrl:mode==="image"?referenceImage:undefined})});
      const data=await response.json();
      if(!response.ok||!data.job)throw new Error(data.error||"Generation request failed");
      setJobs(current=>[{id:data.job.id,prompt:submittedPrompt,model,status:"Queued",created:new Date(data.job.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})},...current]);
      setPrompt("");
    }catch(e){setError(e instanceof Error?e.message:"Generation request failed")}
    finally{setSubmitting(false)}
  }

  return <main className="ai-shell">
    <aside className="ai-side">
      <div className="ai-brand"><div className="ai-logo">A</div><div><strong>AI ROOM</strong><span>Video Studio</span></div></div>
      <nav className="ai-nav">
        <button onClick={()=>setView("generate")} className={view==="generate"?"active":""}>✦ <span>Generate</span></button>
        <button onClick={()=>setView("gallery")} className={view==="gallery"?"active":""}>▣ <span>Gallery</span></button>
        <button onClick={()=>setView("history")} className={view==="history"?"active":""}>◷ <span>History</span></button>
      </nav>
      <div className="engine"><i className={providerState.realGeneration?"":"idle"}/><div><strong>{providerState.realGeneration?"Engine ready":"Demo mode"}</strong><span>{providerState.realGeneration?"Wan 2.2 via fal.ai":"Real generation not connected"}</span></div></div>
    </aside>

    <section className="ai-main">
      <header><div><span className="kicker">AI VIDEO GENERATOR</span><h1>{view==="generate"?"Create a video":view==="gallery"?"Gallery":"History"}</h1><p>{view==="generate"?"Describe the scene. AI ROOM handles the generation workflow.":view==="gallery"?"Completed generations in one place.":"Recent generation activity and job status."}</p></div><div className="badge">{providerState.realGeneration?"WAN LIVE":"MVP · DEMO MODE"}</div></header>

      {view==="generate"&&<>
        <div className="studio-grid">
          <section className="composer card">
            <div className="tabs"><button onClick={()=>setMode("text")} className={mode==="text"?"active":""}>Text → Video</button><button onClick={()=>setMode("image")} className={mode==="image"?"active":""}>Image → Video</button></div>
            {mode==="image"&&<div>
              <label className="drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>onReferenceImage(e.target.files?.[0])}/>{referenceImage?<><img className="reference-preview" src={referenceImage} alt="Reference preview"/><b>{referenceName}</b><span>Click to replace · JPG, PNG or WEBP · max 2.5 MB</span></>:<><b>＋ Add reference image</b><span>JPG, PNG or WEBP · max 2.5 MB</span></>}</label>
              {imageError&&<div className="error-banner">{imageError}</div>}
            </div>}
            <label className="field"><span>Prompt</span><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="A cinematic night scene, soft light, natural camera movement..."/></label>
            <div className="options">
              <label><span>Model</span><select value={model} onChange={e=>setModel(e.target.value)}><option>Wan 2.2 Fast</option><option>Wan 2.2 14B</option><option>Premium (coming soon)</option></select></label>
              <label><span>Duration</span><select value={duration} onChange={e=>setDuration(e.target.value)}><option>5s</option>{model.includes("14B")&&<option>10s</option>}</select></label>
              <label><span>Aspect</span><select value={ratio} onChange={e=>setRatio(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
              <label><span>Quality</span><select value={quality} onChange={e=>setQuality(e.target.value)}><option>580p</option><option>720p</option></select></label>
            </div>
            {!providerState.realGeneration&&providerState.checked&&<div className="info-banner">Preview mode — connect the fal.ai provider to enable real video generation.</div>}
            {error&&<div className="error-banner">{error}</div>}
            <div className="generate-row"><div><small>Estimated compute</small><strong>{estimate} · {duration} · {quality}</strong></div><button className="generate" disabled={!canGenerate||submitting} onClick={generate}>{submitting?"Submitting…":"Generate video ✦"}</button></div>
          </section>
          <aside className="preview card">{readyVideo?<video className="result-video" src={readyVideo} controls playsInline/>:<div className="preview-box"><div className="play">▶</div><strong>Your video appears here</strong><span>Generate a clip to preview it.</span></div>}<div className="preview-meta"><span>{model}</span><span>{ratio}</span><span>{duration}</span><span>{quality}</span></div></aside>
        </div>
        <section className="queue card"><div className="section-head"><div><span className="kicker">QUEUE</span><h2>Recent generations</h2></div><span>{jobs.length} jobs</span></div>
          {jobs.length===0?<div className="empty">No generations yet. Your first job will appear here.</div>:jobs.slice(0,8).map(j=><div className="job" key={j.id}><div className="thumb">✦</div><div><strong>{j.prompt}</strong><span>{j.model} · {j.created}</span></div><b>{j.status}</b></div>)}
        </section>
      </>}

      {view==="gallery"&&<section className="queue card"><div className="section-head"><div><span className="kicker">GALLERY</span><h2>Completed videos</h2></div><span>{completedJobs.length} videos</span></div>
        <div className="gallery-grid">{completedJobs.map(j=><article className="gallery-item" key={j.id}><video src={j.videoUrl} controls playsInline/><strong>{j.prompt}</strong><span>{j.model} · {j.created}</span></article>)}{completedJobs.length===0&&<div className="empty">Completed videos will appear here.</div>}</div>
      </section>}

      {view==="history"&&<section className="queue card"><div className="section-head"><div><span className="kicker">HISTORY</span><h2>Generation history</h2></div><span>{jobs.length} jobs</span></div>
        {jobs.length===0?<div className="empty">No generation history yet.</div>:jobs.map(j=><div className="job" key={j.id}><div className="thumb">◷</div><div><strong>{j.prompt}</strong><span>{j.model} · {j.created}</span></div><b>{j.status}</b></div>)}
      </section>}
    </section>
  </main>
}
