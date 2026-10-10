#!/usr/bin/env node
// Temporary read-only, Preview-branch build diagnostic. Remove after isolating OCI issue.
// Never log environment variable contents, PEM, signatures, URL paths, object keys or response bodies.
if (process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "feature/ai-room-oci-native-storage") {
  process.exit(0);
}
console.log("OCI_BUILD_PROBE_START");
const tenancyOCID=process.env.AI_ROOM_OCI_TENANCY_ID||"";
const userOCID=process.env.AI_ROOM_OCI_USER_ID||"";
const fp=process.env.AI_ROOM_OCI_KEY_FINGERPRINT||"";
console.log("OCI_BUILD_PROBE_OCID_FORMAT",JSON.stringify({
  tenancyWhitespace:/\s/.test(tenancyOCID),userWhitespace:/\s/.test(userOCID),
  fingerprintWhitespace:/\s/.test(fp),
  tenancyControls:/[\x00-\x1f\x7f]/.test(tenancyOCID),
  userControls:/[\x00-\x1f\x7f]/.test(userOCID),
  tenancyHasQuotes:/["']/.test(tenancyOCID),
  userHasQuotes:/["']/.test(userOCID),
  tenancyHasPrefix:tenancyOCID.startsWith("ocid1.tenancy."),
  userHasPrefix:userOCID.startsWith("ocid1.user.")
}));
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
  // First line only, with hard redaction before logging. Never disclose IDs, PEM, auth headers or opaque tokens.
  const firstLine=msg.split(/\r?\n/)[0].slice(0,210);
  const redacted=firstLine
    .replace(/ocid1\.[^\s"'<>]+/gi,"[OCID]")
    .replace(/https?:\/\/[^\s"'<>]+/gi,"[URL]")
    .replace(/(?:Authorization|Bearer|Signature version|private.key|-----BEGIN)[^\r\n]*/gi,"[SECRET]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[EMAIL]")
    .replace(/[A-Za-z0-9_+\/=-]{24,}/g,"[OPAQUE]")
    .replace(/[0-9a-f]{2}(?::[0-9a-f]{2}){15}/gi,"[FINGERPRINT]");
  const noSensitiveTokens=!/(?:-----BEGIN|ocid1\.|Authorization:|Signature version|PRIVATE KEY)/i.test(redacted);
  return {kind:e instanceof Error?"Error":typeof e,status:typeof e?.statusCode==="number"?e.statusCode:null,
    codeType:typeof rawCode,codeNumber:typeof rawCode==="number"?rawCode:null,
    codeLength:typeof rawCode==="string"?rawCode.length:0,
    msgLength:msg.length,tags,safeFirstLine:noSensitiveTokens?redacted:"[REDACTED]",hasCause:Boolean(e?.cause)};
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
// Cross-check OCI SDK against a minimal Node crypto signed GET using the same credentials.
// Read-only: requests at most one list item, and emits status only, never objects or auth headers.
try {
  const {createSign,createPrivateKey,sign,verify}=await import("node:crypto");
  const pem=(process.env.AI_ROOM_OCI_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  const pk=createPrivateKey({key:pem,passphrase:process.env.AI_ROOM_OCI_KEY_PASSPHRASE||undefined});
  const sample=Buffer.from("AI_ROOM_DIAGNOSTIC_NO_DATA");
  const signature=sign("RSA-SHA256",sample,pk);
  console.log("OCI_BUILD_PROBE_CRYPTO",JSON.stringify({
    keyType:pk.asymmetricKeyType,localSign:signature.length>0,
    localVerify:verify("RSA-SHA256",sample,await import("node:crypto").then(m=>m.createPublicKey(pk)),signature)
  }));
  const ns=process.env.AI_ROOM_OCI_NAMESPACE||"";
  const bucket=process.env.AI_ROOM_OCI_BUCKET||"";
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(ns)||!/^[A-Za-z0-9._-]{1,200}$/.test(bucket))throw new Error("invalid namespace or bucket");
  const host="objectstorage.ap-batam-1.oraclecloud.com";
  const url=new URL("https://"+host+"/n/"+encodeURIComponent(ns)+"/b/"+encodeURIComponent(bucket)+"/o");
  url.searchParams.set("prefix","jobs/tester_a/");
  url.searchParams.set("limit","1");
  const xdate=new Date().toUTCString();
  const message="(request-target): get "+url.pathname+url.search+"\nhost: "+host+"\nx-date: "+xdate;
  const signing=createSign("RSA-SHA256");
  signing.update(message,"utf8");
  const signed=signing.sign(pk,"base64");
  const keyId=[process.env.AI_ROOM_OCI_TENANCY_ID,process.env.AI_ROOM_OCI_USER_ID,process.env.AI_ROOM_OCI_KEY_FINGERPRINT].join("/");
  const auth='Signature version="1",keyId="'+keyId+'",algorithm="rsa-sha256",headers="(request-target) host x-date",signature="'+signed+'"';
  const res=await fetch(url,{method:"GET",headers:{Authorization:auth,"x-date":xdate,host},signal:AbortSignal.timeout(9000),cache:"no-store"});
  console.log("OCI_BUILD_PROBE_RAW_SIGNED_LIST",JSON.stringify({ok:res.ok,status:res.status}));
  await res.body?.cancel();
}catch(e){console.log("OCI_BUILD_PROBE_RAW_SIGNED_LIST",JSON.stringify({ok:false,...tagged(e)}));}

console.log("OCI_BUILD_PROBE_DONE");
