#!/usr/bin/env node
// Temporary read-only, Preview-branch build diagnostic. Remove after isolating OCI issue.
// Never log environment variable contents, PEM, signatures, URL paths, object keys or response bodies.
if (process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "feature/ai-room-oci-native-storage") {
  process.exit(0);
}
console.log("OCI_BUILD_PROBE_START");
const tagged = (e) => {
  const msg = typeof e?.message === "string" ? e.message : "";
  const rawCode = e?.code;
  const allowed = ["signature","signing","auth","authentication","credentials","provider","invalid",
    "denied","network","fetch","failed","timeout","timed","connection","connect","reset","dns",
    "enotfound","econnreset","socket","certificate","ssl","tls","openssl","digest","unsupported",
    "pem","key","rsa","passphrase","incorrect","request","response","http","https",
    "url","hostname","endpoint","region","code","status","notfound","unauthorized","forbidden",
    "notauthenticated","undefined","retry","error","expected","argument","type","configuration",
    "wrong","format","skew","get","list","objects","fetcherror","syntax","parse"];
  const lower = msg.toLowerCase();
  const tags = allowed.filter(w => new RegExp("\\b"+w+"\\b","i").test(lower));
  return {kind:e instanceof Error?"Error":typeof e,status:typeof e?.statusCode==="number"?e.statusCode:null,
    codeType:typeof rawCode,codeNumber:typeof rawCode==="number"?rawCode:null,
    codeLength:typeof rawCode==="string"?rawCode.length:0,
    msgLength:msg.length,tags,hasCause:Boolean(e?.cause)};
};
try {
  const res = await fetch("https://objectstorage.ap-batam-1.oraclecloud.com/",{
    method:"HEAD",signal:AbortSignal.timeout(6500),cache:"no-store"
  });
  console.log("OCI_BUILD_PROBE_REACHABILITY",JSON.stringify({reached:true,status:res.status}));
  await res.body?.cancel();
} catch(e) { console.log("OCI_BUILD_PROBE_REACHABILITY",JSON.stringify({reached:false,...tagged(e)})); }
try {
  const common = await import("oci-common");
  const os = await import("oci-objectstorage");
  const p = new common.SimpleAuthenticationDetailsProvider(
    process.env.AI_ROOM_OCI_TENANCY_ID,process.env.AI_ROOM_OCI_USER_ID,
    process.env.AI_ROOM_OCI_KEY_FINGERPRINT,
    (process.env.AI_ROOM_OCI_PRIVATE_KEY||"").replace(/\\\\n/g,"\n"),
    process.env.AI_ROOM_OCI_KEY_PASSPHRASE||null,
    common.Region.AP_BATAM_1
  );
  const client = new os.ObjectStorageClient({authenticationDetailsProvider:p},{
    retryConfiguration:{terminationStrategy:new common.MaxAttemptsTerminationStrategy(1)}
  });
  try {
    client.region=common.Region.AP_BATAM_1;
    const result=await client.listObjects({
      namespaceName:process.env.AI_ROOM_OCI_NAMESPACE,
      bucketName:process.env.AI_ROOM_OCI_BUCKET,
      prefix:"jobs/tester_a/",limit:1,fields:"name,timeModified"
    });
    console.log("OCI_BUILD_PROBE_SIGNED_LIST",JSON.stringify({ok:true,hasEntries:(result.listObjects.objects||[]).length>0}));
  }catch(e){ console.log("OCI_BUILD_PROBE_SIGNED_LIST",JSON.stringify({ok:false,...tagged(e)})); }
  finally{client.close();}
}catch(e){console.log("OCI_BUILD_PROBE_INIT",JSON.stringify(tagged(e)));}
console.log("OCI_BUILD_PROBE_DONE");
