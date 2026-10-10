import AiRoomClient from "./AiRoomClient";
import PrivateAiRoomClient from "./PrivateAiRoomClient";
import {generationAccessState} from "@/lib/ai-room-access";
import {privateVideoEnabled,privateVideoConfigured} from "@/lib/ai-room-private-auth";
import {matureContentModeEnabled} from "@/lib/ai-room-content-policy";

export const dynamic="force-dynamic";
export default function AiRoomPage(){
  const provider=process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase()||"development";
  const realGeneration=provider==="fal"&&Boolean(process.env.AI_ROOM_FAL_KEY);
  if(privateVideoEnabled())return <PrivateAiRoomClient ready={realGeneration&&privateVideoConfigured()}/>;
  return <AiRoomClient initialProviderState={{
    checked:true,provider,realGeneration,...generationAccessState(),matureModeAvailable:matureContentModeEnabled()
  }}/>;
}
