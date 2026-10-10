"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {WAN_CATALOG,WAN_MODEL_NAMES,isWanModel,type WanModel,type WanDuration,type WanQuality} from "@/lib/wan-models";
import {estimateWanCostUsd} from "@/lib/ai-room-jobs";
import {aspectValue,frameReferenceImage,type AiRoomAspect} from "@/lib/ai-room-framing";

type PrivateJob={
  id:string;prompt:string;model:string;mode:string;duration:string;aspect:string;quality:string;
  status:"queued"|"processing"|"completed"|"failed";createdAt:string;
  videoUrl?:string;downloadUrl?:string;videoWidth?:number;videoHeight?:number;error?:string;
  contentMode?:"standard"|"mature";
};
type Screen="generate"|"gallery"|"history"|"usage";
async function asJson(response:Response):Promise<Record<string,unknown>>{
  const data:unknown=await response.json().catch(()=>({}));
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Unexpected server response");
  const obj=data as Record<string,unknown>;
  if(!response.ok)throw new Error(typeof obj.error==="string"?obj.error:"AI ROOM request failed");
  return obj;
}

export default function PrivateAiRoomClient({ready}:{ready:boolean}){
  const [user,setUser]=useState<string|null>(null);
  const [checking,setChecking]=useState(true);
  const [loginName,setLoginName]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [view,setView]=useState<Screen>("generate");
  const [jobs,setJobs]=useState<PrivateJob[]>([]);
  const [mode,setMode]=useState<"text"|"image">("text");
  const [contentMode,setContentMode]=useState<"standard"|"mature">("standard");
  const [matureEligible,setMatureEligible]=useState(false);
  const [adultConfirmed,setAdultConfirmed]=useState(false);
  const [prompt,setPrompt]=useState("");
  const [model,setModel]=useState<WanModel>("Wan 2.2 Fast");
  const [duration,setDuration]=useState<WanDuration>("5s");
  const [ratio,setRatio]=useState<AiRoomAspect>("16:9");
  const [quality,setQuality]=useState<WanQuality>("720p");
  const [preserveFace,setPreserveFace]=useState(true);
  const [reference,setReference]=useState("");
  const [referenceName,setReferenceName]=useState("");
  const [openJob,setOpenJob]=useState<PrivateJob|null>(null);
  const pollingActive=useRef(false);

  const loadJobs=useCallback(async()=>{
    const result=await asJson(await fetch("/api/ai-room/jobs",{cache:"no-store"}));
    if(Array.isArray(result.jobs))setJobs(result.jobs as PrivateJob[]);
  },[]);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const data=await asJson(await fetch("/api/ai-room/session",{cache:"no-store"}));
        if(active && data.authenticated===true && typeof data.user==="string"){setUser(data.user);setMatureEligible(data.matureEligible===true);}
      }catch(e){if(active)setError(e instanceof Error?e.message:"Could not check private session");}
      finally{if(active)setChecking(false);}
    })();
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!user)return;
    void loadJobs().catch(e=>setError(e instanceof Error?e.message:"Could not load videos"));
    // Refresh short-lived signed preview links; no raw provider URLs are saved locally.
    const refresh=window.setInterval(()=>{void loadJobs().catch(()=>{});},4*60*1000);
    return()=>window.clearInterval(refresh);
  },[user,loadJobs]);
  useEffect(()=>{
    if(!user || !jobs.some(j=>j.status==="queued" || j.status==="processing"))return;
    const timer=window.setInterval(()=>{
      if(pollingActive.current)return;
      pollingActive.current=true;
      const pending=jobs.filter(j=>j.status==="queued"||j.status==="processing");
      void (async()=>{
        try {for(const job of pending){
          try{
            const result=await asJson(await fetch("/api/ai-room/generate/"+encodeURIComponent(job.id),{cache:"no-store"}));
            const update=result.job as PrivateJob;
            setJobs(current=>current.map(row=>row.id===job.id?update:row));
          }catch(e){
            setError(e instanceof Error?e.message:"Status temporarily unavailable; job was not resubmitted");
          }
        }}finally{pollingActive.current=false;}
      })();
    },7000);
    return()=>window.clearInterval(timer);
  },[jobs,user]);

  async function login(){
    setBusy(true);setError("");
    try{
      const data=await asJson(await fetch("/api/ai-room/session",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user:loginName,password})
      }));
      if(typeof data.user!=="string")throw new Error("Invalid session");
      setUser(data.user);setPassword("");setMatureEligible(data.matureEligible===true);
      setContentMode("standard");setAdultConfirmed(false);
    }catch(e){setError(e instanceof Error?e.message:"Login failed");}
    finally{setBusy(false);}
  }
  async function logout(){
    try{
      await asJson(await fetch("/api/ai-room/session",{method:"DELETE"}));
      setUser(null);setJobs([]);setOpenJob(null);setReference("");setPrompt("");setError("");
      setMatureEligible(false);setContentMode("standard");setAdultConfirmed(false);
    }catch(e){setError(e instanceof Error?e.message:"Sign-out failed");}
  }
  function imageChanged(file?:File){
    setReference("");setReferenceName("");
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>2_500_000){
      setError("Use a JPG, PNG or WEBP reference no larger than 2.5 MB.");return;
    }
    const reader=new FileReader();
    reader.onload=()=>{if(typeof reader.result==="string"){setReference(reader.result);setReferenceName(file.name);}};
    reader.onerror=()=>setError("Could not read reference photo");
    reader.readAsDataURL(file);
  }
  function pickModel(value:string){
    if(!isWanModel(value))return;
    setModel(value);
    if(!(WAN_CATALOG[value].durations as readonly string[]).includes(duration))setDuration("5s");
    if(!(WAN_CATALOG[value].qualities as readonly string[]).includes(quality))setQuality("720p");
  }
  const estimate=useMemo(()=>estimateWanCostUsd({model,mode,duration,quality}),[model,mode,duration,quality]);
  const canGenerate=ready&&Boolean(user)&&!busy&&prompt.trim().length>=3&&(mode==="text"||Boolean(reference))&&estimate!==null&&(contentMode==="standard"||(matureEligible&&adultConfirmed&&mode==="text"));
  async function generate(){
    if(!canGenerate)return;
    setBusy(true);setError("");
    try{
      const imageUrl=mode==="image"?await frameReferenceImage(reference,ratio):undefined;
      const result=await asJson(await fetch("/api/ai-room/generate",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:prompt.trim(),mode,model,duration,aspect:ratio,quality,preserveFace:mode==="image"&&preserveFace,imageUrl,contentMode,adultConfirmed:contentMode==="mature"&&adultConfirmed})
      }));
      setJobs(current=>[result.job as PrivateJob,...current]);
      setPrompt("");
    }catch(e){setError(e instanceof Error?e.message:"Generate failed. Check Gallery before retrying.");}
    finally{setBusy(false);}
  }
  async function deleteJob(job:PrivateJob){
    if(!window.confirm("Permanently delete this video from private OCI storage? This cannot be undone."))return;
    setBusy(true);setError("");
    try{
      await asJson(await fetch("/api/ai-room/generate/"+encodeURIComponent(job.id),{method:"DELETE"}));
      setJobs(current=>current.filter(item=>item.id!==job.id));
      setOpenJob(current=>current?.id===job.id?null:current);
    }catch(e){setError(e instanceof Error?e.message:"Delete failed; retry safely");}
    finally{setBusy(false);}
  }
  const completed=jobs.filter(j=>j.status==="completed");
  const latest=completed[0];
  const visible=view==="gallery"?completed:jobs;
  const title=view==="generate"?"Create a private video":view==="gallery"?"Private Gallery":view==="history"?"Video History":"Usage & Cost";
  return <main className="control-room ai-room-route">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">C</div><div><strong>CONTROL ROOM</strong><span>Operations Console</span></div></div>
      <nav><Link className="nav-item" href="/database"><span>▦</span> Database</Link>
        <Link className="nav-item active" href="/ai-room"><span>✦</span> AI ROOM</Link></nav>
      <div className="side-foot"><span className={"status-dot "+(ready?"online":"offline")}/>
        <div><strong>Private OCI Storage</strong><small>Batam · Owner-only access</small></div></div>
    </aside>
    <section className="workspace ai-room-workspace"><div className="ai-main">
      <header><div><span className="kicker">AI VIDEO GENERATOR · PRIVATE MODE</span><h1>{title}</h1><p>Videos are kept in your private OCI bucket until you delete them.</p></div>
        <div className="badge">{ready?"OCI PRIVATE":"SETUP REQUIRED"}</div></header>
      {!ready&&<div className="error-banner" role="alert">Private OCI mode is not configured. Generation is safely disabled. Ask the operator to configure the private bucket and per-user credentials.</div>}
      {error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setError("")}> × </button></div>}
      {checking?<div className="card">Checking private session…</div>:!user?
        <section className="card composer"><h2>Sign in to AI ROOM</h2>
          <p>Private videos are available only in their owner's account.</p>
          <label className="field"><span>Username</span><input value={loginName} autoComplete="username" onChange={e=>setLoginName(e.target.value)}/></label>
          <label className="field"><span>Password</span><input type="password" value={password} autoComplete="current-password" onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void login();}}/></label>
          <div className="generate-row"><span>24-hour secure session</span><button className="generate" disabled={busy||!ready||!loginName||!password} onClick={()=>void login()}>Sign in</button></div>
        </section>:<>
        <div className="ai-subnav">
          <button className={view==="generate"?"active":""} onClick={()=>setView("generate")}>✦ Generate</button>
          <button className={view==="gallery"?"active":""} onClick={()=>setView("gallery")}>▣ Gallery</button>
          <button className={view==="history"?"active":""} onClick={()=>setView("history")}>◷ History</button>
          <button className={view==="usage"?"active":""} onClick={()=>setView("usage")}>◌ Usage</button>
          <button onClick={()=>void logout()}>Sign out ({user})</button>
        </div>
        {view==="generate"&&<div className="studio-grid">
          <section className="composer card">
            <div className="content-mode-toggle" role="group" aria-label="Content category">
              <button type="button" className={contentMode==="standard"?"active":""} aria-pressed={contentMode==="standard"} onClick={()=>{setContentMode("standard");setAdultConfirmed(false);}}>Standard</button>
              <button type="button" className={contentMode==="mature"?"active":""} aria-pressed={contentMode==="mature"} disabled={!matureEligible} onClick={()=>{setContentMode("mature");setMode("text");setAdultConfirmed(false);}}>Mature 18+</button>
            </div>
            {contentMode==="mature"&&<div className="mature-mode-notice">
              <strong>Mature 18+ · non-explicit</strong>
              <p>Adult romance, sensual atmosphere, and cinematic storytelling only. No nudity, explicit acts, sexualized minors, or non-consensual intimate material. Text-to-video only.</p>
              <label className="mature-confirm"><input type="checkbox" checked={adultConfirmed} onChange={e=>setAdultConfirmed(e.target.checked)}/><span>I confirm that I am at least 18 years old, the depicted people are consenting adults, and I have permission to use the content.</span></label>
              <small>Eligibility is controlled by your account operator. The model provider can still reject prompts under its own policies. Output remains in your private OCI gallery.</small>
            </div>}
            <div className="tabs"><button className={mode==="text"?"active":""} onClick={()=>setMode("text")}>Text → Video</button>
              <button disabled={contentMode==="mature"} className={mode==="image"?"active":""} onClick={()=>setMode("image")}>Image → Video</button></div>
            {mode==="image"&&<div>
              <label className="drop"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{imageChanged(e.target.files?.[0]);e.currentTarget.value="";}}/>
                {reference?<><img className="reference-preview" src={reference} alt="Reference photo"/><b>{referenceName}</b></>:<><b>＋ Add reference image</b><span>JPG / PNG / WEBP · max 2.5 MB</span></>}</label>
              <label className="face-consistency"><input type="checkbox" checked={preserveFace} onChange={e=>setPreserveFace(e.target.checked)}/>
                <span><strong>Keep face consistent</strong><small>Best-effort model guidance, not an identity guarantee.</small></span></label>
            </div>}
            <label className="field"><span>Prompt</span><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the motion, subject and style…"/></label>
            <div className="options">
              <label><span>Model</span><select value={model} onChange={e=>pickModel(e.target.value)}>{WAN_MODEL_NAMES.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
              <label><span>Duration</span><select value={duration} onChange={e=>setDuration(e.target.value as WanDuration)}>{WAN_CATALOG[model].durations.map(d=><option key={d}>{d}</option>)}</select></label>
              <label><span>Aspect</span><select value={ratio} onChange={e=>setRatio(e.target.value as AiRoomAspect)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
              <label><span>Quality</span><select value={quality} onChange={e=>setQuality(e.target.value as WanQuality)}>{WAN_CATALOG[model].qualities.map(q=><option key={q}>{q}</option>)}</select></label>
            </div>
            <div className="info-banner">Your generated file will transfer from fal.ai into private OCI Object Storage. The reference is processed by fal.ai during inference.</div>
            <div className="generate-row"><div><small>Estimated fal.ai cost</small><strong>{estimate===null?"Unavailable":"~$"+estimate.toFixed(2)}</strong><small>Daily generation limit applies.</small></div>
              <button className="generate" disabled={!canGenerate} onClick={()=>void generate()}>{busy?"Working…":"Generate video ✦"}</button></div>
          </section>
          <aside className="preview card">
            {latest?.videoUrl?<><video className="result-video" src={latest.videoUrl} controls playsInline style={{aspectRatio:aspectValue(latest.aspect)}}/>
              <div className="result-actions"><a href={"/api/ai-room/videos/"+encodeURIComponent(latest.id)+"/download"}>Download / Backup</a>
                <button disabled={busy} onClick={()=>void deleteJob(latest)}>Delete</button></div></>:
              <div className="preview-box" style={{aspectRatio:aspectValue(ratio)}}><div className="play">▶</div><strong>Your private video appears here</strong></div>}
          </aside>
        </div>}
        {view==="usage"&&<section className="queue card"><h2>Usage</h2>
          <p>{jobs.length} saved jobs · {completed.length} completed. Cost estimates are not billing statements.</p>
          <p>Videos remain in OCI until you delete them. Your daily generation limit is configured by the operator.</p>
        </section>}
        {(view==="gallery"||view==="history"||view==="generate")&&<section className="queue card">
          <div className="section-head"><div><span className="kicker">PRIVATE STORAGE</span><h2>{view==="gallery"?"Completed videos":view==="history"?"Generation history":"Recent generations"}</h2></div><span>{visible.length} jobs</span></div>
          {visible.length===0?<div className="empty">No saved videos here yet.</div>:
          <div className={view==="gallery"?"gallery-grid":""}>{(view==="generate"?visible.slice(0,8):visible).map(job=>
            <article className={view==="gallery"?"gallery-item":"job"} key={job.id}>
              {job.videoUrl&&view==="gallery"?<video src={job.videoUrl} controls playsInline style={{aspectRatio:aspectValue(job.aspect)}}/>:<div className="thumb">✦</div>}
              <div><strong>{job.prompt}</strong><span>{job.model} · {job.duration} · {job.aspect} · {job.status}{job.contentMode==="mature"?" · Mature 18+ non-explicit":""}</span>
                {job.error&&<div className="error-banner">{job.error}</div>}
                <div className="result-actions">
                  {job.status==="completed"&&<a href={"/api/ai-room/videos/"+encodeURIComponent(job.id)+"/download"}>Download / Backup</a>}
                  {job.status==="completed"&&<button onClick={()=>setOpenJob(job)}>Fullscreen</button>}
                  <button disabled={busy} onClick={()=>void deleteJob(job)}>Delete</button>
                </div>
              </div>
            </article>)}</div>}
        </section>}
      </>}
    </div></section>
    {openJob?.videoUrl&&<div className="fullscreen-layer" role="dialog" aria-modal="true" onClick={()=>setOpenJob(null)}>
      <div className="fullscreen-content" onClick={e=>e.stopPropagation()}>
        <button className="fullscreen-close" onClick={()=>setOpenJob(null)}>×</button>
        <video controls autoPlay playsInline src={openJob.videoUrl} style={{aspectRatio:aspectValue(openJob.aspect)}}/>
        <div className="result-actions"><a href={"/api/ai-room/videos/"+encodeURIComponent(openJob.id)+"/download"}>Download / Backup</a></div>
      </div></div>}
  </main>;
}
