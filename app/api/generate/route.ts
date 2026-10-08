import {NextResponse} from "next/server";import {getVideoEngine,type VideoRequest} from "@/lib/video-engine";
export async function POST(request:Request){
  try{
    const body=await request.json() as Partial<VideoRequest>;
    if(!body.prompt||body.prompt.trim().length<3)return NextResponse.json({error:"Prompt is required"},{status:400});
    const mode=body.mode==="image"?"image":"text";
    const imageUrl=typeof body.imageUrl==="string"?body.imageUrl:"";
    if(mode==="image"){
      if(!imageUrl.startsWith("data:image/"))return NextResponse.json({error:"Reference image is required"},{status:400});
      if(imageUrl.length>3_500_000)return NextResponse.json({error:"Reference image is too large"},{status:413});
    }
    const input:VideoRequest={
      prompt:body.prompt.trim(),
      mode,
      model:body.model||"Wan 2.2 Fast",
      duration:body.duration==="10s"?"10s":"5s",
      aspect:["9:16","1:1"].includes(body.aspect||"")?body.aspect as VideoRequest["aspect"]:"16:9",
      quality:body.quality==="580p"?"580p":"720p",
      imageUrl:mode==="image"?imageUrl:undefined
    };
    const job=await getVideoEngine().submit(input);
    return NextResponse.json({success:true,job});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Invalid generation request"},{status:400});
  }
}
