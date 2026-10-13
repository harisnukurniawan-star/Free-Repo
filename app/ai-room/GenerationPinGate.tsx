"use client";
import {useEffect,useState} from "react";

/** PIN never enters localStorage/sessionStorage, nor the paid generate request. */
export default function GenerationPinGate({onChange,refreshKey}:{onChange:(value:boolean)=>void;refreshKey?:string}){
  const [pin,setPin]=useState("");
  const [active,setActive]=useState(false);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    // Delay state updates to avoid stale account UI after login changes.
    void fetch("/api/ai-room/generation-pin",{cache:"no-store"})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"PIN status unavailable.");
        if(live){
          const enabled=data.enabled===true&&data.ready===true;
          setReady(enabled);setActive(enabled&&data.active===true);
          onChange(enabled&&data.active===true);
          setError("");
        }
      })
      .catch(e=>{if(live){setReady(false);setActive(false);onChange(false);setError(e instanceof Error?e.message:"PIN status unavailable.");}})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[onChange,refreshKey]);
  async function activate(){
    if(busy||!ready||!/^[0-9]{8,12}$/.test(pin))return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/ai-room/generation-pin",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin})
      });
      const data=await response.json();
      if(!response.ok||data.active!==true)throw new Error(data.error||"PIN activation failed.");
      setActive(true);onChange(true);
    }catch(e){
      setActive(false);onChange(false);
      setError(e instanceof Error?e.message:"PIN activation failed.");
    }finally{setBusy(false);setPin("");}
  }
  async function deactivate(){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/ai-room/generation-pin",{method:"DELETE"});
      if(!response.ok)throw new Error("Could not lock generation. Please refresh and retry.");
      setActive(false);onChange(false);setPin("");
    }catch(e){setError(e instanceof Error?e.message:"PIN lock failed.");}
    finally{setBusy(false);}
  }
  return <div className="field ai-access-key">
    <span>Generation PIN</span>
    {loading?<small>Checking generation access…</small>:active?
      <div className="info-banner" role="status">✓ Generation unlocked (up to 8 hours).
        <button type="button" disabled={busy} onClick={()=>void deactivate()}>Lock generation</button>
      </div>:
      <>
        <input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
          minLength={8} maxLength={12} value={pin} disabled={busy||!ready}
          onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,12))}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void activate();}}}
          placeholder="Enter 8–12 digit generation PIN" aria-label="Generation PIN"/>
        <button type="button" disabled={busy||!ready||pin.length<8} onClick={()=>void activate()}>
          {busy?"Checking…":"Activate Generate"}
        </button>
        <small>PIN stays out of browser storage. Paid generation is authorized server-side.</small>
      </>}
    {!ready&&!loading&&<div className="error-banner" role="alert">Generation PIN setup is incomplete. Contact the operator.</div>}
    {error&&<div className="error-banner" role="alert">{error}</div>}
  </div>;
}
