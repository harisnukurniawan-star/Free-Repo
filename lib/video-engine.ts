export type VideoRequest={prompt:string;mode:"text"|"image";model:string;duration:"5s"|"10s";aspect:"16:9"|"9:16"|"1:1";quality:"580p"|"720p";imageUrl?:string};
export type VideoJob={id:string;status:"queued"|"processing"|"completed"|"failed";provider:string;createdAt:string;videoUrl?:string};
export interface VideoEngine{name:string;submit(input:VideoRequest):Promise<VideoJob>;status(id:string):Promise<VideoJob>}

class DevelopmentEngine implements VideoEngine{
  name="development";
  async submit(_:VideoRequest):Promise<VideoJob>{throw new Error("Real video generation is not configured. Connect fal.ai before generating a video.")}
  async status(id:string):Promise<VideoJob>{return{id,status:"failed",provider:this.name,createdAt:new Date().toISOString()}}
}

class FalWanEngine implements VideoEngine{
  name="fal-wan";
  constructor(private key:string){}

  private endpoint(tier:"fast"|"a14b",mode:"text"|"image"){
    if(tier==="a14b")return mode==="image"?"fal-ai/wan/v2.2-a14b/image-to-video":"fal-ai/wan/v2.2-a14b/text-to-video";
    return mode==="image"?"fal-ai/wan/v2.2-5b/image-to-video":"fal-ai/wan/v2.2-5b/text-to-video/distill";
  }

  async submit(input:VideoRequest):Promise<VideoJob>{
    if(input.mode==="image"&&!input.imageUrl)throw new Error("Image is required for image-to-video");
    const tier: "fast"|"a14b"=input.model.includes("14B")?"a14b":"fast";
    if(tier==="fast"&&input.duration==="10s")throw new Error("Wan 2.2 Fast supports up to 5 seconds");
    const endpoint=this.endpoint(tier,input.mode);
    const fps=tier==="fast"?24:16;
    const numFrames=input.duration==="10s"?161:(tier==="fast"?121:81);
    const payload:Record<string,unknown>={prompt:input.prompt,resolution:input.quality,aspect_ratio:input.aspect,frames_per_second:fps,num_frames:numFrames};
    if(input.imageUrl)payload.image_url=input.imageUrl;
    const response=await fetch(`https://queue.fal.run/${endpoint}`,{method:"POST",headers:{Authorization:`Key ${this.key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await response.json() as {request_id?:string;detail?:string};
    if(!response.ok||!data.request_id)throw new Error(data.detail||"Wan provider rejected the request");
    return{id:`${tier}:${input.mode}:${data.request_id}`,status:"queued",provider:this.name,createdAt:new Date().toISOString()};
  }

  async status(id:string):Promise<VideoJob>{
    const parts=id.split(":");
    const tier: "fast"|"a14b"=parts.length>=3&&parts[0]==="a14b"?"a14b":"fast";
    const mode: "text"|"image"=parts.length>=3&&parts[1]==="image"?"image":"text";
    const rawId=parts.length>=3?parts.slice(2).join(":"):id;
    const endpoint=this.endpoint(tier,mode);
    const headers={Authorization:`Key ${this.key}`};
    const statusResponse=await fetch(`https://queue.fal.run/${endpoint}/requests/${rawId}/status`,{headers,cache:"no-store"});
    const statusData=await statusResponse.json() as {status?:string;detail?:string};
    if(!statusResponse.ok)throw new Error(statusData.detail||`Unable to read job status (${statusResponse.status})`);

    const state=(statusData.status||"").toUpperCase();
    const normalized:VideoJob["status"]=
      state==="COMPLETED"?"completed":
      state==="IN_PROGRESS"?"processing":
      state==="FAILED"?"failed":
      "queued";

    if(normalized!=="completed")return{id,status:normalized,provider:this.name,createdAt:new Date().toISOString()};

    const resultResponse=await fetch(`https://queue.fal.run/${endpoint}/requests/${rawId}`,{headers,cache:"no-store"});
    const result=await resultResponse.json() as {video?:{url?:string};data?:{video?:{url?:string}};detail?:string};
    if(!resultResponse.ok)throw new Error(result.detail||`Unable to fetch video result (${resultResponse.status})`);
    const videoUrl=result.video?.url||result.data?.video?.url;
    if(!videoUrl)throw new Error("fal completed the job but returned no video URL");
    return{id,status:"completed",provider:this.name,createdAt:new Date().toISOString(),videoUrl};
  }
}

export function getVideoEngine():VideoEngine{
  const provider=process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase();
  if(provider==="fal"){
    const key=process.env.AI_ROOM_FAL_KEY;
    if(!key)throw new Error("AI_ROOM_FAL_KEY is required when AI_ROOM_VIDEO_PROVIDER=fal");
    return new FalWanEngine(key);
  }
  return new DevelopmentEngine();
}
