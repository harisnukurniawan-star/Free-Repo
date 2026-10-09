"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createVideoJobPoller } from "@/lib/ai-room-polling";
import { estimateWanCost, formatUsd } from "@/lib/ai-room-usage";

type Mode="text"|"image";
type View="generate"|"gallery"|"history"|"usage";
type Job={id:string;prompt:string;model:string;status:"Queued"|"Processing"|"Ready"|"Failed";created:string;createdAt?:string;videoUrl?:string;error?:string;mode?:Mode;duration?:string;aspect?:string;quality?:string;estimatedCost?:number};
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
  const [jobs,setJobs]=useState<Job[]>([]);
  const [submitting,setSubmitting]=useState(false);
  const submissionInFlight=useRef(false);
  const poller=useRef<ReturnType<typeof createVideoJobPoller>|null>(null);
  const [error,setError]=useState("");
  const [hydrated,setHydrated]=useState(false);
  const [referenceImage,setReferenceImage]=useState("");
  const [referenceName,setReferenceName]=useState("");
  const [imageError,setImageError]=useState("");
  const [providerState,setProviderState]=useState<ProviderState>(initialProviderState);
  const [actionMessage,setActionMessage]=useState("");
  const [fullscreenJob,setFullscreenJob]=useState<Job|null>(null);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      try{
        const saved=localStorage.getItem("ai-room-jobs");
        if(saved){
          const parsed=JSON.parse(saved) as Job[];
          setJobs(parsed.map(j=>j.status==="Ready"&&!j.videoUrl?{...j,status:"Failed" as const,error:"This saved generation has no video URL."}:j));
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

  const canGenerate=providerState.realGeneration&&!model.startsWith("Premium")&&prompt.trim().length>=3&&(mode==="text"||!!referenceImage);
  const previewJob=jobs.find(j=>j.videoUrl);
  const readyVideo=previewJob?.videoUrl;
  const completedJobs=jobs.filter(j=>j.videoUrl);
  const computeTier=useMemo(()=>model.includes("Fast")?"Low":model.includes("14B")?"Medium":"Premium",[model]);
  const currentEstimatedCost=useMemo(()=>estimateWanCost({model,mode,duration,quality}),[model,mode,duration,quality]);
  const totalEstimatedCost=jobs.reduce((sum,j)=>sum+(j.estimatedCost??0),0);
  const completedEstimatedCost=jobs.filter(j=>j.status==="Ready").reduce((sum,j)=>sum+(j.estimatedCost??0),0);
  const failedJobs=jobs.filter(j=>j.status==="Failed").length;

  async function copyResult(job:Job){
    if(!job.videoUrl)return;
    try{
      await navigator.clipboard.writeText(job.videoUrl);
      setActionMessage("Video link copied.");
    }catch{
      setActionMessage("Could not copy the video link.");
    }
  }

  async function downloadResult(job:Job){
    if(!job.videoUrl)return;
    try{
      const response=await fetch(job.videoUrl,{mode:"cors"});
      if(!response.ok)throw new Error("download failed");
      const blob=await response.blob();
      const href=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=href;
      anchor.download=`ai-room-${job.id.replace(/[^a-zA-Z0-9_-]/g,"-")}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setActionMessage("Download started.");
    }catch{
      window.open(job.videoUrl,"_blank","noopener,noreferrer");
      setActionMessage("Direct download was unavailable, so the video opened in a new tab.");
    }
  }

  function regenerateJob(job:Job){
    setPrompt(job.prompt);
    setModel(job.model);
    setDuration(job.model.includes("Fast")?"5s":job.duration??"5s");
    setRatio(job.aspect??"16:9");
    setQuality(job.quality??"720p");
    const nextMode=job.mode??"text";
    setMode(nextMode);
    setReferenceImage("");
    setReferenceName("");
    setView("generate");
    setActionMessage(nextMode==="image"?"Prompt restored. Re-upload the reference image before generating.":"Prompt and settings restored. Review them before generating.");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteJob(job:Job){
    setJobs(current=>current.filter(item=>item.id!==job.id));
    if(fullscreenJob?.id===job.id)setFullscreenJob(null);
    setActionMessage("Generation removed from this browser history.");
  }

  function resultActions(job:Job){
    return <div className="result-actions">
      <button type="button" onClick={()=>void downloadResult(job)}>↓ Download</button>
      <button type="button" onClick={()=>void copyResult(job)}>⧉ Copy link</button>
      <button type="button" onClick={()=>regenerateJob(job)}>↻ Regenerate</button>
      <button type="button" onClick={()=>setFullscreenJob(job)}>⛶ Fullscreen</button>
      <button type="button" className="danger" onClick={()=>deleteJob(job)}>Delete</button>
    </div>;
  }

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
    if(!canGenerate||submissionInFlight.current)return;
    submissionInFlight.current=true;
    const submittedPrompt=prompt.trim();
    setSubmitting(true);setError("");
    try{
      const response=await fetch("/api/ai-room/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:submittedPrompt,mode,model,duration,aspect:ratio,quality,imageUrl:mode==="image"?referenceImage:undefined})});
      const data=await response.json().catch(()=>{throw new Error("Could not read the submission response. Check your existing jobs before trying again.")});
      if(!response.ok||!data.job)throw new Error(data.error||"Generation request failed");
      setJobs(current=>[{id:data.job.id,prompt:submittedPrompt,model,status:"Queued",created:new Date(data.job.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),createdAt:data.job.createdAt,mode,duration,aspect:ratio,quality,estimatedCost:currentEstimatedCost??undefined},...current]);
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
      <header><div><span className="kicker">AI VIDEO GENERATOR</span><h1>{view==="generate"?"Create a video":view==="gallery"?"Gallery":view==="history"?"History":"Usage & Cost"}</h1><p>{view==="generate"?"Describe the scene. AI ROOM handles the generation workflow.":view==="gallery"?"Completed generations in one place.":view==="history"?"Recent generation activity and job status.":"Estimated usage from generation history saved in this browser."}</p></div><div className="badge">{providerState.realGeneration?"WAN LIVE":"MVP · DEMO MODE"}</div></header>
      <div className="ai-subnav"><button onClick={()=>setView("generate")} className={view==="generate"?"active":""}>✦ Generate</button><button onClick={()=>setView("gallery")} className={view==="gallery"?"active":""}>▣ Gallery</button><button onClick={()=>setView("history")} className={view==="history"?"active":""}>◷ History</button></div>

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
            {actionMessage&&<div className="info-banner" role="status">{actionMessage}</div>}
            <div className="generate-row"><div><small>Estimated compute & cost</small><strong>{computeTier} · {duration} · {quality} · {formatUsd(currentEstimatedCost)}</strong></div><button className="generate" disabled={!canGenerate||submitting} onClick={generate}>{submitting?"Submitting…":"Generate video ✦"}</button></div>
          </section>
          <aside className="preview card">{readyVideo&&previewJob?<><video className="result-video" src={readyVideo} controls playsInline/>{resultActions(previewJob)}</>:<div className="preview-box"><div className="play">▶</div><strong>Your video appears here</strong><span>Generate a clip to preview it.</span></div>}<div className="preview-meta"><span>{model}</span><span>{ratio}</span><span>{duration}</span><span>{quality}</span></div></aside>
        </div>
        <section className="queue card"><div className="section-head"><div><span className="kicker">QUEUE</span><h2>Recent generations</h2></div><span>{jobs.length} jobs</span></div>
          {jobs.length===0?<div className="empty">No generations yet. Your first job will appear here.</div>:jobs.slice(0,8).map(j=><div className="job" key={j.id}><div className="thumb">✦</div><div><strong>{j.prompt}</strong><span>{j.model} · {j.created}</span>{j.error&&<div className="error-banner" role="status">{j.error}</div>}</div><b>{j.status}</b></div>)}
        </section>
      </>}

      {view==="gallery"&&<section className="queue card"><div className="section-head"><div><span className="kicker">GALLERY</span><h2>Completed videos</h2></div><span>{completedJobs.length} videos</span></div>
        <div className="gallery-grid">{completedJobs.map(j=><article className="gallery-item" key={j.id}><video src={j.videoUrl} controls playsInline/><strong>{j.prompt}</strong><span>{j.model} · {j.created} · {formatUsd(j.estimatedCost)}</span>{resultActions(j)}</article>)}{completedJobs.length===0&&<div className="empty">Completed videos will appear here.</div>}</div>
      </section>}

      {view==="history"&&<section className="queue card"><div className="section-head"><div><span className="kicker">HISTORY</span><h2>Generation history</h2></div><span>{jobs.length} jobs</span></div>
        {jobs.length===0?<div className="empty">No generation history yet.</div>:jobs.map(j=><div className="job" key={j.id}><div className="thumb">◷</div><div><strong>{j.prompt}</strong><span>{j.model} · {j.created} · {formatUsd(j.estimatedCost)}</span>{j.error&&<div className="error-banner" role="status">{j.error}</div>}</div><div className="job-side"><b>{j.status}</b><button type="button" onClick={()=>deleteJob(j)}>Delete</button></div></div>)}
      </section>}

      {view==="usage"&&<div className="usage-layout">
        <div className="usage-cards">
          <article className="usage-stat"><span>Estimated submitted cost</span><strong>{formatUsd(totalEstimatedCost)}</strong><small>{jobs.filter(j=>typeof j.estimatedCost==="number").length} tracked jobs</small></article>
          <article className="usage-stat"><span>Completed estimate</span><strong>{formatUsd(completedEstimatedCost)}</strong><small>{completedJobs.length} completed videos</small></article>
          <article className="usage-stat"><span>Total jobs</span><strong>{jobs.length}</strong><small>{failedJobs} failed</small></article>
        </div>
        <section className="queue card usage-table-card">
          <div className="section-head"><div><span className="kicker">USAGE</span><h2>Generation cost history</h2></div><span>Browser history</span></div>
          {jobs.length===0?<div className="empty">Generate a video to begin tracking estimated usage.</div>:<div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Created</th><th>Mode</th><th>Model</th><th>Settings</th><th>Status</th><th>Est. cost</th></tr></thead><tbody>{jobs.map(j=><tr key={j.id}><td>{j.created}</td><td>{j.mode==="image"?"Image → Video":j.mode==="text"?"Text → Video":"—"}</td><td>{j.model}</td><td>{[j.duration,j.aspect,j.quality].filter(Boolean).join(" · ")||"—"}</td><td>{j.status}</td><td>{formatUsd(j.estimatedCost)}</td></tr>)}</tbody></table></div>}
          <p className="usage-note">Estimates use the pricing configured in AI ROOM and may differ from final fal.ai billing. Older browser-history entries created before cost tracking show “—”.</p>
        </section>
      </div>}
      </div>
    </section>
    {fullscreenJob?.videoUrl&&<div className="video-modal" role="dialog" aria-modal="true" aria-label="Video fullscreen preview" onClick={()=>setFullscreenJob(null)}>
      <button type="button" className="video-modal-close" onClick={()=>setFullscreenJob(null)}>×</button>
      <video src={fullscreenJob.videoUrl} controls autoPlay playsInline onClick={e=>e.stopPropagation()}/>
    </div>}
  </main>
}
