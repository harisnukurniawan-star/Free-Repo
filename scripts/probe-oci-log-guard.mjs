#!/usr/bin/env node
// One-off read-only preview smoke check for redacted OCI SDK retry logs.
// No provider calls, customer data changes, or object writes/deletes.
import {randomUUID} from "node:crypto";
if(process.env.VERCEL_ENV!=="preview" ||
   process.env.VERCEL_GIT_COMMIT_REF!=="feature/ai-room-oci-native-storage")process.exit(0);
try{
 const {NativeObjectStore}=await import("../lib/ai-room-native-objects.ts");
 const store=new NativeObjectStore();
 const object="deleted/logging_probe/missing-"+randomUUID()+".json";
 try{
   await store.head(object);
   console.log("AI_ROOM_OCI_LOG_TEST",JSON.stringify({status:"failed",reason:"unexpected_object"}));
 }catch(error){
   console.log("AI_ROOM_OCI_LOG_TEST",JSON.stringify({
     status:error instanceof Error&&error.name==="NotFound"?"pass":"failed",
     reason:error instanceof Error&&error.name==="NotFound"?"expected_404":"unexpected_status"
   }));
 }
}catch{console.log("AI_ROOM_OCI_LOG_TEST",JSON.stringify({status:"failed",reason:"startup"}));}
