import {NextResponse} from "next/server";
import {requirePrivateUser,privateVideoEnabled,requireSameOrigin} from "@/lib/ai-room-private-auth";
import {activateGenerationPin,generationPinEnabled,generationPinConfigured,
  pinCookieOptions,PIN_COOKIE,pinSessionActive} from "@/lib/ai-room-generation-pin";
import {videoEngineError,VideoEngineError} from "@/lib/video-engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
function fail(error:unknown){
  const safe=videoEngineError(error);
  return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:noStore});
}
function ownerFor(request:Request):string|undefined{
  return privateVideoEnabled()?requirePrivateUser(request):undefined;
}
export async function GET(request:Request){
  try{
    const owner=ownerFor(request);
    return NextResponse.json({
      enabled:generationPinEnabled(),
      ready:!generationPinEnabled()||generationPinConfigured(),
      active:pinSessionActive(request,owner),
    },{headers:noStore});
  }catch(error){return fail(error);}
}
export async function POST(request:Request){
  try{
    requireSameOrigin(request);
    const owner=ownerFor(request);
    if(!generationPinEnabled())throw new VideoEngineError("Generation PIN is not enabled.",404,false);
    // Bound parsing: never accept arbitrary payload sizes or log PIN input.
    const text=await request.text();
    if(text.length>256)throw new VideoEngineError("Invalid generation PIN.",400,false);
    let input:unknown;
    try{input=JSON.parse(text);}catch{throw new VideoEngineError("Invalid generation PIN.",400,false);}
    if(!input||typeof input!=="object"||Array.isArray(input)){
      throw new VideoEngineError("Invalid generation PIN.",400,false);
    }
    const token=await activateGenerationPin(request,(input as {pin?:unknown}).pin,owner);
    const result=NextResponse.json({active:true},{headers:noStore});
    result.cookies.set(PIN_COOKIE,token,pinCookieOptions());
    return result;
  }catch(error){return fail(error);}
}
export async function DELETE(request:Request){
  try{
    requireSameOrigin(request);
    ownerFor(request);
    const result=NextResponse.json({active:false},{headers:noStore});
    result.cookies.set(PIN_COOKIE,"",{...pinCookieOptions(),maxAge:0});
    return result;
  }catch(error){return fail(error);}
}
