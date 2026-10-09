"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createVideoJobPoller } from "@/lib/ai-room-polling";
import { estimateWanCostUsd, formatElapsed, normalizeStoredJob, type StoredAiRoomJob } from "@/lib/ai-room-jobs";
import UsageCostView from "./UsageCostView";

type Mode="text"|"image";
type View="generate"|"gallery"|"history"|"usage";
type ProviderState={checked:boolean;provider:string;realGeneration:boolean};
const jobStatuses={queued:"Queued",processing:"Processing",completed:"Ready",failed:"Failed"} as const;

export default function AiRoomClient({initialProviderState}:{initialProviderState:ProviderState}){
  const [mode,setMode]=useState<Mode>("text");
  const [view,setView]=useState<View>("generate");
  const [prompt,setPrompt]=useState("");
  const [model,setModel]=useState("Wan 2.2 Fast");
  const [duration,setDuration]=useState("5s");
  const [ratio,setRatio]=useState("16:9");
  const [quality,setQuality]=useState("720p");
  const [jobs,setJobs]=useState<StoredAiRoomJob[]>([]);
  const [submitting,setSubmitting]=useState(false);
  const submissionInFlight=useRef(false);
  const poller=useRef<ReturnType<typeof createVideoJobPoller>|null>(null);
  const [error,setError]=useState("");
  const [hydrated,setHydrated]=useState(false);
  const [referenceImage,setReferenceImage]=useState("");
  const [referenceName,setReferenceName]=useState("");
  const [imageError,setImageError]=useState("");
  const [providerState,setProviderState]=useState<ProviderState>(initialProviderState);
  const [now,setNow]=useState(()=>Date.now());
  const [fullscreenJob,setFullscreenJob]=useState<StoredAiRoomJob|null>(null);
  const [copiedId,setCopiedId]=useState("");

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      try{
        const saved=localStorage.getItem("ai-room-jobs");
        if(saved){
          const parsed=JSON.parse(saved) as unknown[];
          const normalized=parsed.map(normalizeStoredJob).filter((job):job is StoredAiRoomJob=>Boolean(job));
          setJobs(normalized.map(j=>j.status==="Ready"&&!j.videoUrl?{...j,status:"Failed" as const,error:"This saved generation has no video URL."}:j));
        }
      }catch{
        setError("Could not load saved generation history from this browser.");
      }finally{
        setHydrated(true);
      }
    },0);
    return()=>window.clearTimeout(timer);
  },[]);
  useEffect(()=>{let active=true;fetch("/api/ai-room/health").then(async response=>{const data=await response.json();if(active)setProviderState({checked:true,provider:data.provider||"unknown",realGeneration:Boolean(data.realGeneration)})}).catch(()=>{if(active)setProviderState({checked:true,provider:"unavailable",realGeneration:false})});return()=>{active=false}},[]);
  useEffect(()=>{
    if(!hydrated)return;
    try{
      localStorage.setItem("ai-room-jobs",JSON.stringify(jobs.slice(0,50)));
    }catch{
      const timer=window.setTimeout(()=>setError("Could not save generation history in this browser. Keep this page open to follow your jobs."),0);
      return()=>window.clearTimeout(timer);
    }
  },[jobs,hydrated]);

  useEffect(()=>{
    if(!hydrated||!providerState.realGeneration)return;
    const session=createVideoJobPoller((id,update)=>{
      setJobs(current=>current.map(j=>j.id===id?{...j,status:update.status?jobStatuses[update.status]:j.status,videoUrl:update.videoUrl||j.videoUrl,error:update.error}:j));
    });
    poller.current=session;
    return()=>{session.stop();poller.current=null};
  },[hydrated,providerState.realGeneration]);
  useEffect(()=>{
    poller.current?.setPendingJobs(jobs.filter(j=>j.status==="Queued"||j.status==="Processing").map(j=>j.id));
  },[jobs,hydrated,providerState.realGeneration]);

  const hasPending=jobs.some(j=>j.status==="Queued"||j.status==="Processing");
  useEffect(()=>{
    if(!hasPending)return;
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[hasPending]);

  const canGenerate=providerState.realGeneration&&!model.startsWith("Premium")&&prompt.trim().length>=3&&(mode==="text"||!!referenceImage);
  const readyJob=jobs.find(j=>j.videoUrl);
  const readyVideo=readyJob?.videoUrl;
  const completedJobs=jobs.filter(j=>j.videoUrl);
  const estimate=useMemo(()=>model.includes("Fast")?"Low":model.includes("14B")?"Medium":"Premium",[model]);
  const viewTitle=view==="generate"?"Create a video":view==="gallery"?"Gallery":view==="history"?"History":"Usage & Cost";
  const viewSubtitle=view==="generate"?"Describe the scene. AI ROOM handles the generation workflow.":view==="gallery"?"Completed generations in one place.":view==="history"?"Recent generation activity and job status.":"Estimated generation spend and usage history for this browser.";

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

  function displayTime(job:StoredAiRoomJob){
    if(job.createdAt){
      const date=new Date(job.createdAt);
      if(!Number.isNaN(date.getTime()))return date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    }
    return job.created||"Earlier";
  }

  function statusLabel(job:StoredAiRoomJob){
    if(job.status!=="Queued"&&job.status!=="Processing")return job.status;
    const elapsed=formatElapsed(job.createdAt,now);
    return elapsed?`${job.status} · ${elapsed}`:job.status;
  }

  async function copyVideoLink(job:StoredAiRoomJob){
    if(!job.videoUrl)return;
    try{
      await navigator.clipboard.writeText(job.videoUrl);
      setCopiedId(job.id);
      window.setTimeout(()=>setCopiedId(current=>current===job.id?"":current),1800);
    }catch{
      setError("Could not copy the video link. Open the video and copy the URL manually.");
    }
  }

  function regenerate(job:StoredAiRoomJob){
    setPrompt(job.prompt);
    setModel(job.model);
    const nextMode=job.mode??(job.id.includes(":image:")?"image":"text");
    setMode(nextMode);
    if(job.duration)setDuration(job.duration);
    if(job.aspect)setRatio(job.aspect);
    if(job.quality)setQuality(job.quality);
    if(nextMode==="image"){
      setReferenceImage("");
      setReferenceName("");
      setError("Prompt restored. Re-add the reference image, then click Generate when you are ready.");
    }else setError("");
    setView("generate");
  }

  function deleteJob(id:string){
    setJobs(current=>current.filter(job=>job.id!==id));
    setFullscreenJob(current=>current?.id===id?null:current);
  }

  function resultActions(job:StoredAiRoomJob){
    if(!job.videoUrl)return null;
    return <div className="result-actions">
      <a href={job.videoUrl} download target="_blank" rel="noreferrer">Download</a>
      <button onClick={()=>void copyVideoLink(job)}>{copiedId===job.id?"Copied ✓":"Copy link"}</button>
      <button onClick={()=>setFullscreenJob(job)}>Fullscreen</button>
      <button onClick={()=>regenerate(job)}>Regenerate</button>
      <button className="danger" onClick={()=>deleteJob(job.id)}>Delete</button>
    </div>;
  }

  async function generate(){
    if(!canGenerate||submissionInFlight.current)return;
    submissionInFlight.current=true;
    const submittedPrompt=prompt.trim();
    setSubmitting(true);setError("");
    try{
      const response=await fetch("/api/ai-room/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:submittedPrompt,mode,model,duration,aspect:ratio,quality,imageUrl:mode==="image"?referenceImage:undefined})});
      const data=await response.json().catch(()=>{throw new Error("Could not read the submission response. Check your existing jobs before trying again.")});
      if(!response.ok||!data.job)throw new Error(data.error||"Generation request failed");
      setJobs(current=>[{
        id:data.job.id,
        prompt:submittedPrompt,
        model,
        status:"Queued",
        createdAt:data.job.createdAt||new Date().toISOString(),
        mode,
        duration,
        aspect:ratio,
        quality,
        estimatedCostUsd:estimateWanCostUsd({model,mode,duration,quality})??undefined,
      },...current]);
      setPrompt("");
    }catch(e){setError(e instanceof Error?e.message:"Generation request failed")}
    finally{submissionInFlight.current=false;setSubmitting(false)}
  }

  return <main className="control-room ai-room-route">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div><strong>CONTROL ROOM</strong><span>Operations Console</span></div>
      </div>
      <nav>
        <Link className="nav-item" href="/database"><span>▦</span> Database</Link>
        <Link className="nav-item active" href="/ai-room"><span>✦</span> AI ROOM</Link>
        <button className={`nav-item ${view==="usage"?"active":""}`} onClick={()=>setView("usage")}><span>◌</span> Usage & Cost</button>
      </nav>
      <div className="side-foot">
        <span className={`status-dot ${providerState.realGeneration?"online":"offline"}`} />
        <div>
          <strong>{providerState.realGeneration?"Wan engine ready":"Video engine unavailable"}</strong>
          <small>{providerState.realGeneration?"fal.ai connected":"Check provider configuration"}</small>
        </div>
      </div>
    </aside>

    <section className="workspace ai-room-workspace">
      <div className="ai-main">
      <header><div><span className="kicker">AI VIDEO GENERATOR</span><h1>{viewTitle}</h1><p>{viewSubtitle}</p></div><div className="badge">{providerState.realGeneration?"WAN LIVE":"MVP · DEMO MODE"}</div></header>
      <div className="ai-subnav"><button onClick={()=>setView("generate")} className={view==="generate"?"active":""}>✦ Generate</button><button onClick={()=>setView("gallery")} className={view==="gallery"?"active":""}>▣ Gallery</button><button onClick={()=>setView("history")} className={view==="history"?"active":""}>◷ History</button><button onClick={()=>setView("usage")} className={view==="usage"?"active":""}>◌ Usage & Cost</button></div>

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
              <label><span>Model</span><select value={model} onChange={e=>{const next=e.target.value;setModel(next);if(next.includes("Fast"))setDuration("5s")}}><option>Wan 2.2 Fast</option><option>Wan 2.2 14B</option><option disabled>Premium (coming soon)</option></select></label>
              <label><span>Duration</span><select value={duration} onChange={e=>setDuration(e.target.value)}><option>5s</option>{model.includes("14B")&&<option>10s</option>}</select></label>
              <label><span>Aspect</span><select value={ratio} onChange={e=>setRatio(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
              <label><span>Quality</span><select value={quality} onChange={e=>setQuality(e.target.value)}><option>580p</option><option>720p</option></select></label>
            </div>
            {!providerState.realGeneration&&providerState.checked&&<div className="info-banner">Preview mode — connect the fal.ai provider to enable real video generation.</div>}
            {error&&<div className="error-banner">{error}</div>}
            <div className="generate-row"><div><small>Estimated compute</small><strong>{estimate} · {duration} · {quality}</strong></div><button className="generate" disabled={!canGenerate||submitting} onClick={generate}>{submitting?"Submitting…":"Generate video ✦"}</button></div>
          </section>
          <aside className="preview card">{readyVideo?<><video className="result-video" src={readyVideo} controls playsInline/>{readyJob&&resultActions(readyJob)}</>:<div className="preview-box"><div className="play">▶</div><strong>Your video appears here</strong><span>Generate a clip to preview it.</span></div>}<div className="preview-meta"><span>{model}</span><span>{ratio}</span><span>{duration}</span><span>{quality}</span></div></aside>
        </div>
        <section className="queue card"><div className="section-head"><div><span className="kicker">QUEUE</span><h2>Recent generations</h2></div><span>{jobs.length} jobs</span></div>
          {jobs.length===0?<div className="empty">No generations yet. Your first job will appear here.</div>:jobs.slice(0,8).map(j=><div className="job" key={j.id}><div className="thumb">✦</div><div><strong>{j.prompt}</strong><span>{j.model} · {displayTime(j)}{j.estimatedCostUsd!==undefined?` · est. ${j.estimatedCostUsd.toFixed(2)}`:""}</span>{j.error&&<div className="error-banner" role="status">{j.error}</div>}{resultActions(j)}</div><b>{statusLabel(j)}</b></div>)}
        </section>
      </>}

      {view==="gallery"&&<section className="queue card"><div className="section-head"><div><span className="kicker">GALLERY</span><h2>Completed videos</h2></div><span>{completedJobs.length} videos</span></div>
        <div className="gallery-grid">{completedJobs.map(j=><article className="gallery-item" key={j.id}><video src={j.videoUrl} controls playsInline/><strong>{j.prompt}</strong><span>{j.model} · {displayTime(j)}</span>{resultActions(j)}</article>)}{completedJobs.length===0&&<div className="empty">Completed videos will appear here.</div>}</div>
      </section>}

      {view==="history"&&<section className="queue card"><div className="section-head"><div><span className="kicker">HISTORY</span><h2>Generation history</h2></div><span>{jobs.length} jobs</span></div>
        {jobs.length===0?<div className="empty">No generation history yet.</div>:jobs.map(j=><div className="job" key={j.id}><div className="thumb">◷</div><div><strong>{j.prompt}</strong><span>{j.model} · {displayTime(j)}{j.estimatedCostUsd!==undefined?` · est. ${j.estimatedCostUsd.toFixed(2)}`:""}</span>{j.error&&<div className="error-banner" role="status">{j.error}</div>}{resultActions(j)}</div><b>{statusLabel(j)}</b></div>)}
      </section>}

      {view==="usage"&&<UsageCostView jobs={jobs}/>}
      </div>
    </section>
    {fullscreenJob?.videoUrl&&<div className="fullscreen-layer" role="dialog" aria-modal="true" onClick={()=>setFullscreenJob(null)}><div className="fullscreen-content" onClick={event=>event.stopPropagation()}><button className="fullscreen-close" onClick={()=>setFullscreenJob(null)}>×</button><video src={fullscreenJob.videoUrl} controls autoPlay playsInline/>{resultActions(fullscreenJob)}</div></div>}
  </main>
}
