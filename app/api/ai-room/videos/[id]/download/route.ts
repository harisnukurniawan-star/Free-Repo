import {NextResponse} from "next/server";
import {Readable} from "node:stream";
import {nativeStorageEnabled} from "@/lib/ai-room-native-objects";
import {privateVideoEnabled, requirePrivateUser} from "@/lib/ai-room-private-auth";
import {privateStatus,privateReadNative} from "@/lib/ai-room-private-storage";
import {VideoEngineError,videoEngineError} from "@/lib/video-engine";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Large private MP4 downloads need the same streaming window as Play.
export const maxDuration=300;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    if(!privateVideoEnabled())throw new VideoEngineError("Private video mode is disabled.",404,false);
    const owner=requirePrivateUser(request);
    const {id}=await params;
    if(nativeStorageEnabled()){
      const video=await privateReadNative(owner,id,request.headers.get("range"));
      const headers=new Headers({
        "Content-Type":"video/mp4","Content-Length":String(video.length),
        "Accept-Ranges":"bytes",
        "Content-Disposition":'attachment; filename="ai-room-video.mp4"',
        "Cache-Control":"private, no-store","Referrer-Policy":"no-referrer",
        "X-Content-Type-Options":"nosniff"
      });
      if(video.partial)headers.set("Content-Range",
        "bytes "+video.start+"-"+video.end+"/"+video.total);
      return new Response(Readable.toWeb(video.stream) as ReadableStream,{
        status:video.partial?206:200,headers
      });
    }
    const job=await privateStatus(owner,id);
    if(job.status!=="completed" || !job.downloadUrl)throw new VideoEngineError("Video is not yet ready.",409,true);
    return NextResponse.redirect(job.downloadUrl,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch(e){const safe=videoEngineError(e);return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});}
}
