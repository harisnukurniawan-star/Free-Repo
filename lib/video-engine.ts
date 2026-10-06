export type VideoRequest={prompt:string;mode:"text"|"image";model:string;duration:"5s"|"10s";aspect:"16:9"|"9:16"|"1:1";quality:"480p"|"720p";imageUrl?:string};
export type VideoJob={id:string;status:"queued"|"processing"|"completed"|"failed";provider:string;createdAt:string};
export interface VideoEngine{name:string;submit(input:VideoRequest):Promise<VideoJob>}
class DevelopmentEngine implements VideoEngine{name="development";async submit(_:VideoRequest){return{id:crypto.randomUUID(),status:"queued",provider:this.name,createdAt:new Date().toISOString()}}}
class FalWanEngine implements VideoEngine{
  name="fal-wan";
  constructor(private key:string){}
  async submit(input:VideoRequest):Promise<VideoJob>{
    if(input.mode==="image"&&!input.imageUrl)throw new Error("Image URL is required for image-to-video");
    const endpoint=input.mode==="image"?"fal-ai/wan/v2.2-5b/image-to-video":"fal-ai/wan/v2.2-5b/text-to-video/distill";
    const payload:Record<string,unknown>={prompt:input.prompt,resolution:input.quality,aspect_ratio:input.aspect};
    if(input.imageUrl)payload.image_url=input.imageUrl;
    const response=await fetch(`https://queue.fal.run/${endpoint}`,{method:"POST",headers:{Authorization:`Key ${this.key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await response.json() as {request_id?:string;detail?:string};
    if(!response.ok||!data.request_id)throw new Error(data.detail||"Wan provider rejected the request");
    return{id:data.request_id,status:"queued",provider:this.name,createdAt:new Date().toISOString()};
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
