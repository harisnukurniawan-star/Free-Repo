import assert from "node:assert/strict";
import test from "node:test";
import { buildArchitectureNodes } from "../app/components/ArchitectureLiveStatus";
import type { HcActivity } from "../lib/hc-connect-activity";
import type { HasnariaActivity } from "../lib/hasnaria-activity";
import type { HasnariaData } from "../lib/hasnaria-monitoring";

const at="2026-10-18T07:00:00Z";
const hc:HcActivity={checkedAt:at,website:{state:"online",code:200,checkedAt:at},github:{
  prsSource:"snapshot",runsSource:"snapshot",issuesSource:"snapshot",commitsSource:"snapshot",
  prs:[{number:397,title:"Fix bootstrap",draft:false,updatedAt:at,url:"https://github.com/jakgunn20-maker/hcbp-hub/pull/397"}],
  runs:[],issuesCount:0,commits:[]},vercel:{source:"unavailable",production:null,failedPreviews:0},signals:[]};
const hasnaria:HasnariaActivity={checkedAt:at,actionsSource:"unavailable",issuesSource:"unavailable",runs:[],issueCount:0,signals:[],
  website:{state:"error",httpCode:503,checkedAt:at}};
const hasData:HasnariaData={checkedAt:at,githubSource:"snapshot",githubNote:"Last snapshot",openPrs:[{
  number:88,title:"Fix Purchase–Stock",state:"open",url:"https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/88",updatedAt:at}],
  vercel:{source:"snapshot",value:"READY",checkedAt:at},
  production:{source:"snapshot",value:"ACTIVE_HEALTHY",checkedAt:at},
  staging:{source:"unavailable",value:"Belum terhubung",checkedAt:at}};
test("architecture never labels stale production/database metadata live healthy",()=>{
  const result=buildArchitectureNodes({hc,hasnaria,hasData});
  const tokyo=result.has.find(n=>n.id==="Supabase Tokyo");
  assert.equal(tokyo?.state,"warning");
  assert.equal(tokyo?.source,"snapshot");
  assert.equal(result.has.find(n=>n.id==="has-vercel")?.state,"warning");
  assert.equal(result.has.find(n=>n.id==="Supabase Singapore")?.state,"unknown");
  assert.equal(result.hc.find(n=>n.id==="hc-vercel")?.state,"unknown");
});
test("website HTTP errors remain red; GitHub PRs are warnings, not outages",()=>{
  const result=buildArchitectureNodes({hc,hasnaria,hasData});
  assert.equal(result.hc.find(n=>n.id==="hc-website")?.state,"ok");
  assert.equal(result.hc.find(n=>n.id==="hc-github")?.state,"warning");
  assert.equal(result.has.find(n=>n.id==="has-web")?.state,"bad");
  assert.equal(result.has.find(n=>n.id==="has-github")?.state,"warning");
});
