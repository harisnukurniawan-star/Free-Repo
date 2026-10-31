/** Authenticated, read-only acceptance for existing OCI video data.
 * Verify matching first and last 32 bytes through Play/Download, then prove
 * that requests with cookies deliberately omitted are denied on both paths.
 * No provider submission, storage write, delete, raw video logs or secrets.
 */
export async function verifyPrivateVideoBytes(
  id:string,fetcher:typeof fetch=fetch
):Promise<{bytesChecked:number;totalBytes:number;anonymousDenied:boolean}>{
  if(!/^[A-Za-z0-9:_-]{1,160}$/.test(id)){
    throw new Error("Invalid saved video identifier.");
  }
  const target="/api/ai-room/videos/"+encodeURIComponent(id);
  type Route="stream"|"download";
  async function sample(path:Route,start:number,end:number){
    const response=await fetcher(target+"/"+path,{
      method:"GET",cache:"no-store",credentials:"same-origin",
      headers:{Range:"bytes="+start+"-"+end},
      signal:AbortSignal.timeout(20_000)
    });
    if(response.status!==206){
      await response.body?.cancel().catch(()=>{});
      throw new Error("OCI "+path+" check returned HTTP "+response.status+
        ". No video was modified.");
    }
    const value=response.headers.get("content-range")||"";
    const match=/^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/([1-9][0-9]*)$/.exec(value);
    const total=match?Number(match[3]):NaN;
    const length=end-start+1;
    if(!match||Number(match[1])!==start||Number(match[2])!==end||
      !Number.isSafeInteger(total)||total<=end||
      response.headers.get("content-length")!==String(length)||
      !(response.headers.get("content-type")||"").startsWith("video/mp4")||
      !(response.headers.get("cache-control")||"").includes("no-store")){
      await response.body?.cancel().catch(()=>{});
      throw new Error("OCI "+path+" returned an invalid partial MP4 response.");
    }
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length!==length)throw new Error("OCI "+path+" returned incomplete video bytes.");
    return {bytes,total};
  }
  function matches(a:Uint8Array,b:Uint8Array){
    return a.length===b.length && a.every((value,i)=>value===b[i]);
  }
  // Sequential 32-byte requests avoid saturating private OCI connections.
  const headPlay=await sample("stream",0,31);
  const headDownload=await sample("download",0,31);
  if(headPlay.total!==headDownload.total||
     !matches(headPlay.bytes,headDownload.bytes)){
    throw new Error("OCI Play and Download returned different opening video bytes.");
  }
  const last=headPlay.total-1;
  const first=Math.max(0,headPlay.total-32);
  const tailPlay=await sample("stream",first,last);
  const tailDownload=await sample("download",first,last);
  if(tailPlay.total!==headPlay.total||tailDownload.total!==headPlay.total||
     !matches(tailPlay.bytes,tailDownload.bytes)){
    throw new Error("OCI Play and Download returned different ending video bytes.");
  }
  async function ensureAnonymousDenied(path:Route){
    // Omit cookies, even though the authenticated owner initiated this action.
    const response=await fetcher(target+"/"+path,{
      method:"GET",cache:"no-store",credentials:"omit",
      headers:{Range:"bytes=0-31"},
      signal:AbortSignal.timeout(20_000)
    });
    const denied=response.status===401 &&
      (response.headers.get("content-type")||"").includes("application/json") &&
      (response.headers.get("cache-control")||"").includes("no-store");
    await response.body?.cancel().catch(()=>{});
    if(!denied)throw new Error("Unauthenticated "+path+
      " was not safely denied (HTTP "+response.status+"). Contact the operator.");
  }
  await ensureAnonymousDenied("stream");
  await ensureAnonymousDenied("download");
  return {bytesChecked:headPlay.bytes.length+headDownload.bytes.length+
    tailPlay.bytes.length+tailDownload.bytes.length,
    totalBytes:headPlay.total,anonymousDenied:true};
}
