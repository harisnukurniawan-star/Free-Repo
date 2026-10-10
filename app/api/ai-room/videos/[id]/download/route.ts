import {NextResponse} from "next/server";
import {privateVideoEnabled, requirePrivateUser} from "@/lib/ai-room-private-auth";
import {privateStatus} from "@/lib/ai-room-private-storage";
import {VideoEngineError,videoEngineError} from "@/lib/video-engine";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    if(!privateVideoEnabled())throw new VideoEngineError("Private video mode is disabled.",404,false);
    const owner=requirePrivateUser(request);
    const {id}=await params;
    const job=await privateStatus(owner,id);
    if(job.status!=="completed" || !job.downloadUrl)throw new VideoEngineError("Video is not yet ready.",409,true);
    return NextResponse.redirect(job.downloadUrl,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch(e){const safe=videoEngineError(e);return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});}
}
