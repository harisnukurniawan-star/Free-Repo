#!/usr/bin/env node
/**
 * Authenticated-route smoke test using real Preview OCI storage, without network
 * HTTP traffic to the deployment, fal.ai calls, or data mutation.
 * Never print tokens, account IDs, prompts, object names, or video links.
 */
if(process.env.VERCEL_ENV!=="preview" ||
   process.env.VERCEL_GIT_COMMIT_REF!=="feature/ai-room-oci-native-storage"){
  process.exit(0);
}
const log=(test,state,more={})=>console.log("AI_ROOM_OCI_AUTH_PROBE "+JSON.stringify({test,state,...more}));
try{
  const accounts=JSON.parse(process.env.AI_ROOM_USERS_JSON||"[]");
  if(!Array.isArray(accounts)||accounts.length<2)throw Error("two_accounts_required");
  const {makeSession,SESSION_COOKIE}=await import("../lib/ai-room-private-auth.ts");
  const {NativeObjectStore}=await import("../lib/ai-room-native-objects.ts");
  const {GET:listJobs}=await import("../app/api/ai-room/jobs/route.ts");
  const {GET:jobStatus}=await import("../app/api/ai-room/generate/[id]/route.ts");
  const {GET:stream}=await import("../app/api/ai-room/videos/[id]/stream/route.ts");
  const {GET:download}=await import("../app/api/ai-room/videos/[id]/download/route.ts");

  const cookie=id=>SESSION_COOKIE+"="+encodeURIComponent(makeSession(id));
  const request=(path,id)=>new Request("https://ai-room.preview.local"+path,{
    headers:id?{cookie:cookie(id)}:{}
  });
  const path="/api/ai-room/jobs";
  const unauthorized=await listJobs(request(path));
  log("unauthenticated_gallery",unauthorized.status===401?"pass":"failed",
    {httpStatus:unauthorized.status});
  let totalVisible=0,allOk=true;
  for(let i=0;i<accounts.length;i++){
    const response=await listJobs(request(path,accounts[i].id));
    if(response.status!==200){
      allOk=false;continue;
    }
    const body=await response.json();
    if(!Array.isArray(body.jobs)){allOk=false;continue;}
    totalVisible+=body.jobs.length;
  }
  log("authenticated_owner_galleries",allOk?"pass":"failed",
    {accountsChecked:accounts.length,visibleRecords:totalVisible});

  const store=new NativeObjectStore();
  let picked=null;
  for(let i=0;i<accounts.length;i++){
    const result=await store.list("jobs/"+accounts[i].id+"/",20);
    const key=result.Contents?.find(x=>typeof x.Key==="string"&&
      /^jobs\/[a-z0-9_-]+\/(?:fast|a14b|v27|v3|v3prime):(text|image):[A-Za-z0-9_-]{1,128}\.json$/.test(x.Key));
    if(key){
      const token=key.Key.slice(("jobs/"+accounts[i].id+"/").length,-5);
      const target=accounts[(i+1)%accounts.length].id;
      picked={id:token,owner:accounts[i].id,other:target};
      break;
    }
  }
  if(!picked){
    log("cross_account_routes","inconclusive",{reason:"no_metadata_to_probe"});
  }else{
    const pathId=encodeURIComponent(picked.id);
    const context={params:Promise.resolve({id:picked.id})};
    const cases=[
      ["status",jobStatus,"/api/ai-room/generate/"+pathId],
      ["stream",stream,"/api/ai-room/videos/"+pathId+"/stream"],
      ["download",download,"/api/ai-room/videos/"+pathId+"/download"]
    ];
    for(const [name,handler,path] of cases){
      const response=await handler(request(path,picked.other),context);
      log("cross_account_"+name,response.status===404?"pass":"failed",
        {httpStatus:response.status});
      await response.body?.cancel();
    }
  }
}catch(e){
  // Do not log the exception: SDK errors can contain signed requests.
  log("setup_or_execution","failed",{kind:e instanceof SyntaxError?"parse":"unavailable"});
}
