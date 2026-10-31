/** Authenticated, read-only proof that private Play and Download agree.
 * Fetch only 32 bytes on each endpoint, never submit a provider job.
 * No credentials, prompts, or media bytes are logged or persisted.
 */
export async function verifyPrivateVideoBytes(
  id:string,fetcher:typeof fetch=fetch
):Promise<{bytesChecked:number;totalBytes:number}>{
  if(!/^[A-Za-z0-9:_-]{1,160}$/.test(id)){
    throw new Error("Invalid saved video identifier.");
  }
  const target="/api/ai-room/videos/"+encodeURIComponent(id);
  async function sample(path:"stream"|"download"){
    const response=await fetcher(target+"/"+path,{
      method:"GET",cache:"no-store",credentials:"same-origin",
      headers:{Range:"bytes=0-31"},
      signal:AbortSignal.timeout(20_000)
    });
    if(response.status!==206){
      await response.body?.cancel().catch(()=>{});
      throw new Error("OCI "+path+" check returned HTTP "+response.status+
        ". No video was modified.");
    }
    const range=response.headers.get("content-range")||"";
    const match=/^bytes 0-31\/([1-9][0-9]*)$/.exec(range);
    const total=match?Number(match[1]):NaN;
    if(!Number.isSafeInteger(total)||total<32||
      response.headers.get("content-length")!=="32"||
      !(response.headers.get("content-type")||"").startsWith("video/mp4")){
      await response.body?.cancel().catch(()=>{});
      throw new Error("OCI "+path+" returned an invalid partial MP4 response.");
    }
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length!==32)throw new Error("OCI "+path+" returned incomplete video bytes.");
    return {bytes,total};
  }
  // Sequential to avoid multiplying private streaming requests on one user click.
  const played=await sample("stream");
  const downloaded=await sample("download");
  if(played.total!==downloaded.total||
    !played.bytes.every((value,i)=>value===downloaded.bytes[i])){
    throw new Error("OCI Play and Download returned different video bytes.");
  }
  return {bytesChecked:played.bytes.length,totalBytes:played.total};
}
