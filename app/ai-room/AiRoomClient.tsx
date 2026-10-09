"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createVideoJobPoller } from "@/lib/ai-room-polling";
import { WAN_CATALOG, WAN_MODEL_NAMES, isWanModel, type WanModel, type WanDuration, type WanQuality } from "@/lib/wan-models";
import { estimateWanCostUsd, formatElapsed, normalizeStoredJob, type StoredAiRoomJob } from "@/lib/ai-room-jobs";
import UsageCostView from "./UsageCostView";
import {aspectValue, frameReferenceImage, matchesAspect, type AiRoomAspect} from "@/lib/ai-room-framing";

type Mode="text"|"image";
type View="generate"|"gallery"|"history"|"usage";
type ProviderState={checked:boolean;provider:string;realGeneration:boolean;generationLocked:boolean;generationAuthRequired:boolean};
const jobStatuses={queued:"Queued",processing:"Processing",completed:"Ready",failed:"Failed"} as const;

export default function AiRoomClient({initialProviderState}:{initialProviderState:ProviderState}){
  const [mode,setMode]=useState<Mode>("text");
  const [view,setView]=useState<View>("generate");
  const [prompt,setPrompt]=useState("");
  const [model,setModel]=useState<WanModel>("Wan 2.2 Fast");
  const [duration,setDuration]=useState<WanDuration>("5s");
  const [ratio,setRatio]=useState("16:9");
  const [quality,setQuality]=useState<WanQuality>("720p");
  const [preserveFace,setPreserveFace]=useState(true);
  const [jobs,setJobs]=useState<StoredAiRoomJob[]>([]);
  const [submitting,setSubmitting]=useState(false);
  const [accessKey,setAccessKey]=useState("");
  const referenceReadId=useRef(0);
  const submissionInFlight=useRef(false);
  const poller=useRef<ReturnType<typeof createVideoJobPoller>|null>(null);
  const [error,setError]=useState("");
  const [hydrated,setHydrated]=useState(false);
  const [historyWritable,setHistoryWritable]=useState(true);
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
          const parsed:unknown=JSON.parse(saved);
          if(!Array.isArray(parsed))throw new Error("Invalid saved history");
          const normalized=parsed.slice(0,50).map(normalizeStoredJob).filter((job):job is StoredAiRoomJob=>Boolean(job));
          setJobs(normalized.map(j=>j.status==="Ready"&&!j.videoUrl?{...j,status:"Failed" as const,error:"This saved generation has no video URL."}:j));
        }
      }catch{
        setHistoryWritable(false);
        setError("Could not read saved browser history. It has been preserved instead of overwritten. New jobs will not be saved in this tab.");
      }finally{
        setHydrated(true);
      }
    },0);
    return()=>window.clearTimeout(timer);
  },[]);
  useEffect(()=>{let active=true;fetch("/api/ai-room/health").then(async response=>{const data=await response.json();if(active)setProviderState({checked:true,provider:data.provider||"unknown",realGeneration:Boolean(data.realGeneration),generationLocked:Boolean(data.generationLocked),generationAuthRequired:true})}).catch(()=>{if(active)setProviderState({checked:true,provider:"unavailable",realGeneration:false,generationLocked:true,generationAuthRequired:true})});return()=>{active=false}},[]);
  useEffect(()=>{
    if(!hydrated||!historyWritable)return;
    try{
      localStorage.setItem("ai-room-jobs",JSON.stringify(jobs.slice(0,50)));
    }catch{
      const timer=window.setTimeout(()=>setError("Could not save generation history in this browser. Keep this page open to follow your jobs."),0);
      return()=>window.clearTimeout(timer);
    }
  },[jobs,hydrated,historyWritable]);

  useEffect(()=>{
    if(!hydrated||!providerState.realGeneration)return;
    const session=createVideoJobPoller((id,update)=>{
      setJobs(current=>current.map(j=>j.id===id?{...j,status:update.status?jobStatuses[update.status]:j.status,videoUrl:update.videoUrl||j.videoUrl,videoWidth:update.videoWidth||j.videoWidth,videoHeight:update.videoHeight||j.videoHeight,error:update.error}:j));
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

  useEffect(()=>{
    const timer=window.setTimeout(()=>{try{setAccessKey(sessionStorage.getItem("ai-room-generation-key")||"")}catch{}},0);
    return()=>window.clearTimeout(timer);
  },[]);

  const modelConfig=WAN_CATALOG[model];
  const estimate=useMemo(()=>estimateWanCostUsd({model,mode,duration,quality}),[model,mode,duration,quality]);
  const canGenerate=providerState.realGeneration&&!providerState.generationLocked&&(!providerState.generationAuthRequired||accessKey.trim().length>0)&&estimate!==null&&prompt.trim().length>=3&&(mode==="text"||!!referenceImage);
  const readyJob=jobs.find(j=>j.videoUrl);
  const readyVideo=readyJob?.videoUrl;
  const completedJobs=jobs.filter(j=>j.videoUrl);
  function selectModel(next:WanModel){
    setModel(next);
    if(!(WAN_CATALOG[next].durations as readonly string[]).includes(duration))setDuration("5s");
    if(!(WAN_CATALOG[next].qualities as readonly string[]).includes(quality))setQuality("720p");
  }
  const viewTitle=view==="generate"?"Create a video":view==="gallery"?"Gallery":view==="history"?"History":"Usage & Cost";
  const viewSubtitle=view==="generate"?"Describe the scene. AI ROOM handles the generation workflow.":view==="gallery"?"Completed generations in one place.":view==="history"?"Recent generation activity and job status.":"Estimated generation spend and usage history for this browser.";

  function onReferenceImage(file?:File){
    const readId=++referenceReadId.current;
    setImageError("");
    setReferenceImage("");
    setReferenceName("");
    if(!file){setReferenceImage("");setReferenceName("");return}
    const allowed=["image/jpeg","image/png","image/webp"];
    if(!allowed.includes(file.type)){setImageError("Use JPG, PNG, or WEBP.");setReferenceImage("");setReferenceName("");return}
    if(file.size>2_500_000){setImageError("Reference image must be 2.5 MB or smaller.");setReferenceImage("");setReferenceName("");return}
    const reader=new FileReader();
    reader.onload=()=>{if(readId===referenceReadId.current&&typeof reader.result==="string"){setReferenceImage(reader.result);setReferenceName(file.name)}};
    reader.onerror=()=>{if(readId===referenceReadId.current)setImageError("Could not read the reference image.")};
    reader.readAsDataURL(file);
  }

  function recordVideoDimensions(id:string, video:HTMLVideoElement){
    const width=video.videoWidth, height=video.videoHeight;
    if(!width||!height)return;
    setJobs(current=>current.map(job=>job.id!==id||(job.videoWidth===width&&job.videoHeight===height)?job:{...job,videoWidth:width,videoHeight:height}));
  }

  function aspectMismatch(job:StoredAiRoomJob){
    const match=matchesAspect(job.videoWidth??0,job.videoHeight??0,job.aspect);
    return match===false?<div className="info-banner" role="status">Video from provider is {job.videoWidth}×{job.videoHeight}, which does not match requested {job.aspect}. Display is not cropped; download retains the original provider file.</div>:null;
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
    const nextModel=isWanModel(job.model)?job.model:"Wan 2.2 Fast";
    setModel(nextModel);
    const nextMode=job.mode??(job.id.includes(":image:")?"image":"text");
    setMode(nextMode);
    setPreserveFace(job.preserveFace!==false);
    setDuration(job.duration==="10s"&&(WAN_CATALOG[nextModel].durations as readonly string[]).includes("10s")?"10s":"5s");
    if(job.aspect)setRatio(job.aspect);
    setQuality((job.quality==="580p"||job.quality==="1080p")&&(WAN_CATALOG[nextModel].qualities as readonly string[]).includes(job.quality)?job.quality:"720p");
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
    const submission={mode,model,duration,aspect:ratio as AiRoomAspect,quality,preserveFace:mode==="image"&&preserveFace};
    setSubmitting(true);setError("");
    try{
      // Prepare the first frame before making the single chargeable POST.
      const imageUrl=mode==="image"?await frameReferenceImage(referenceImage,submission.aspect):undefined;
      const response=await fetch("/api/ai-room/generate",{method:"POST",headers:{"Content-Type":"application/json","x-ai-room-access-key":accessKey},body:JSON.stringify({prompt:submittedPrompt,...submission,imageUrl})});
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
        preserveFace:submission.preserveFace,
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
          <strong>{providerState.generationLocked?"Generation locked":providerState.realGeneration?"Wan engine ready":"Video engine unavailable"}</strong>
          <small>{providerState.generationLocked?"Access key setup required":providerState.realGeneration?"fal.ai connected":"Check provider configuration"}</small>
        </div>
      </div>
    </aside>

    <section className="workspace ai-room-workspace">
      <div className="ai-main">
      <header><div><span className="kicker">AI VIDEO GENERATOR</span><h1>{viewTitle}</h1><p>{viewSubtitle}</p></div><div className="badge">{providerState.generationLocked?"GENERATION LOCKED":providerState.realGeneration?"WAN LIVE":"MVP · DEMO MODE"}</div></header>
      <div className="ai-subnav"><button onClick={()=>setView("generate")} className={view==="generate"?"active":""}>✦ Generate</button><button onClick={()=>setView("gallery")} className={view==="gallery"?"active":""}>▣ Gallery</button><button onClick={()=>setView("history")} className={view==="history"?"active":""}>◷ History</button><button onClick={()=>setView("usage")} className={view==="usage"?"active":""}>◌ Usage & Cost</button></div>

      {view==="generate"&&<>
        <div className="studio-grid">
          <section className="composer card">
            <div className="tabs"><button onClick={()=>setMode("text")} className={mode==="text"?"active":""}>Text → Video</button><button onClick={()=>setMode("image")} className={mode==="image"?"active":""}>Image → Video</button></div>
            {mode==="image"&&<div>
              <label className="drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{onReferenceImage(e.target.files?.[0]);e.currentTarget.value=""}}/>{referenceImage?<><div className="reference-frame" style={{aspectRatio:aspectValue(ratio)}}><img className="reference-preview" src={referenceImage} alt="Reference preview fitted without cropping"/></div><b>{referenceName}</b><span>Click to replace · JPG, PNG or WEBP · max 2.5 MB</span></>:<><b>＋ Add reference image</b><span>JPG, PNG or WEBP · max 2.5 MB</span></>}</label>
              <label className="face-consistency"><input type="checkbox" checked={preserveFace} onChange={e=>setPreserveFace(e.target.checked)}/><span><strong>Keep face consistent (recommended)</strong><small>Tries to preserve the person\u0027s facial features from the uploaded photo. Actual results depend on the model.</small></span></label>
              <div className="info-banner">Reference image is fitted to the selected {ratio} frame without cropping the subject. Extra space uses a softly blurred background.</div>
              {imageError&&<div className="error-banner">{imageError}</div>}
            </div>}
            <label className="field"><span>Prompt</span><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="A cinematic night scene, soft light, natural camera movement..."/></label>
            <div className="options">
              <label><span>Model</span><select value={model} onChange={e=>{if(isWanModel(e.target.value))selectModel(e.target.value)}}>{WAN_MODEL_NAMES.map(name=><option key={name} value={name}>{name}{name==="Wan 3.0"?" · Recommended":""}</option>)}</select></label>
              <label><span>Duration</span><select value={duration} onChange={e=>setDuration(e.target.value as WanDuration)}>{modelConfig.durations.map(value=><option key={value}>{value}</option>)}</select></label>
              <label><span>Aspect</span><select value={ratio} onChange={e=>setRatio(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
              <label><span>Quality</span><select value={quality} onChange={e=>setQuality(e.target.value as WanQuality)}>{modelConfig.qualities.map(value=><option key={value}>{value}</option>)}</select></label>
            </div>
            {!providerState.realGeneration&&providerState.checked&&<div className="info-banner">Preview mode — connect the fal.ai provider to enable real video generation.</div>}
            {providerState.generationLocked&&<div className="info-banner" role="status">Paid generation is locked until the server administrator configures AI_ROOM_GENERATE_ACCESS_KEY (minimum 16 characters). No fal.ai credit can be charged while locked.</div>}
            {providerState.generationAuthRequired&&!providerState.generationLocked&&<label className="field ai-access-key"><span>Generation access key</span><input type="password" value={accessKey} autoComplete="off" placeholder="Enter your AI ROOM access key" onChange={e=>{const key=e.target.value;setAccessKey(key);try{sessionStorage.setItem("ai-room-generation-key",key)}catch{}}}/><small>Kept only in this browser tab session. Required to authorize paid generation.</small></label>}
            {error&&<div className="error-banner">{error}</div>}
            <div className="generate-row"><div><small>Est. fal.ai charge · {duration} · {quality}</small><strong>{estimate===null?"Unavailable":`~${estimate.toFixed(2)} USD`}</strong><small>Estimated only · charged from existing fal.ai credit when submitted, not a live balance. <a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener noreferrer">Check actual balance at fal.ai ↗</a></small></div><button className="generate" disabled={!canGenerate||submitting} onClick={generate}>{submitting?"Submitting…":"Generate video ✦"}</button></div>
          </section>
          <aside className="preview card">{readyVideo?<><video className="result-video" src={readyVideo} controls playsInline style={{aspectRatio:aspectValue(readyJob?.aspect)}} onLoadedMetadata={e=>{if(readyJob)recordVideoDimensions(readyJob.id,e.currentTarget)}}/>{readyJob&&aspectMismatch(readyJob)}{readyJob&&resultActions(readyJob)}</>:<div className="preview-box" style={{aspectRatio:aspectValue(ratio)}}><div className="play">▶</div><strong>Your {ratio} video appears here</strong><span>Generate a clip to preview it.</span></div>}<div className="preview-meta">{(readyJob?[readyJob.model,readyJob.aspect,readyJob.duration,readyJob.quality]:[model,ratio,duration,quality]).filter(Boolean).map((detail,index)=><span key={`${index}-${detail}`}>{detail}</span>)}</div></aside>
        </div>
        <section className="queue card"><div className="section-head"><div><span className="kicker">QUEUE</span><h2>Recent generations</h2></div><span>{jobs.length} jobs</span></div>
          {jobs.length===0?<div className="empty">No generations yet. Your first job will appear here.</div>:jobs.slice(0,8).map(j=><div className="job" key={j.id}><div className="thumb">✦</div><div><strong>{j.prompt}</strong><span>{j.model} · {displayTime(j)}{j.estimatedCostUsd!==undefined?` · est. ${j.estimatedCostUsd.toFixed(2)}`:""}</span>{j.error&&<div className="error-banner" role="status">{j.error}</div>}{resultActions(j)}</div><b>{statusLabel(j)}</b></div>)}
        </section>
      </>}

      {view==="gallery"&&<section className="queue card"><div className="section-head"><div><span className="kicker">GALLERY</span><h2>Completed videos</h2></div><span>{completedJobs.length} videos</span></div>
        <div className="gallery-grid">{completedJobs.map(j=><article className="gallery-item" key={j.id}><video src={j.videoUrl} controls playsInline style={{aspectRatio:aspectValue(j.aspect)}} onLoadedMetadata={e=>recordVideoDimensions(j.id,e.currentTarget)}/>{aspectMismatch(j)}<strong>{j.prompt}</strong><span>{j.model} · {displayTime(j)}</span>{resultActions(j)}</article>)}{completedJobs.length===0&&<div className="empty">Completed videos will appear here.</div>}</div>
      </section>}

      {view==="history"&&<section className="queue card"><div className="section-head"><div><span className="kicker">HISTORY</span><h2>Generation history</h2></div><span>{jobs.length} jobs</span></div>
        {jobs.length===0?<div className="empty">No generation history yet.</div>:jobs.map(j=><div className="job" key={j.id}><div className="thumb">◷</div><div><strong>{j.prompt}</strong><span>{j.model} · {displayTime(j)}{j.estimatedCostUsd!==undefined?` · est. ${j.estimatedCostUsd.toFixed(2)}`:""}</span>{j.error&&<div className="error-banner" role="status">{j.error}</div>}{resultActions(j)}</div><b>{statusLabel(j)}</b></div>)}
      </section>}

      {view==="usage"&&<UsageCostView jobs={jobs}/>}
      </div>
    </section>
    {fullscreenJob?.videoUrl&&<div className="fullscreen-layer" role="dialog" aria-modal="true" onClick={()=>setFullscreenJob(null)}><div className="fullscreen-content" onClick={event=>event.stopPropagation()}><button className="fullscreen-close" onClick={()=>setFullscreenJob(null)}>×</button><video src={fullscreenJob.videoUrl} controls autoPlay playsInline style={{aspectRatio:aspectValue(fullscreenJob.aspect)}} onLoadedMetadata={e=>recordVideoDimensions(fullscreenJob.id,e.currentTarget)}/>{aspectMismatch(fullscreenJob)}{resultActions(fullscreenJob)}</div></div>}
  </main>
}
