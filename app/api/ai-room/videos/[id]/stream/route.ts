import {Readable} from "node:stream";
import {NextResponse} from "next/server";
import {nativeStorageEnabled} from "@/lib/ai-room-native-objects";
import {privateVideoEnabled,requirePrivateUser} from "@/lib/ai-room-private-auth";
import {privateReadNative} from "@/lib/ai-room-private-storage";
import {VideoEngineError,videoEngineError} from "@/lib/video-engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

// Range requests are needed for MP4 seeking. All bytes go through a server-
// authenticated endpoint and never a publicly accessible OCI URL.
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    if(!privateVideoEnabled()||!nativeStorageEnabled()){
      throw new VideoEngineError("Private native video mode is disabled.",404,false);
    }
    const owner=requirePrivateUser(request);
    const {id}=await params;
    const result=await privateReadNative(owner,id,request.headers.get("range"));
    const headers=new Headers({
      "Content-Type":"video/mp4",
      "Content-Length":String(result.length),
      "Accept-Ranges":"bytes",
      "Cache-Control":"private, no-store, max-age=0",
      "Content-Disposition":"inline",
      "Referrer-Policy":"no-referrer",
      "X-Content-Type-Options":"nosniff",
    });
    if(result.partial)headers.set("Content-Range",
      "bytes "+result.start+"-"+result.end+"/"+result.total);
    return new Response(Readable.toWeb(result.stream) as ReadableStream,{
      status:result.partial?206:200,headers
    });
  }catch(error){
    const safe=videoEngineError(error);
    return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});
  }
}
