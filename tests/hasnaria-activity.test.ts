import assert from "node:assert/strict";
import test from "node:test";
import {loadHasnariaActivity} from "../lib/hasnaria-activity";

const keys=["HASNARIA_GITHUB_TOKEN"] as const;
async function mockedFetch(
  handler:(url:string)=>Response,
  fn:()=>Promise<void>,
) {
  const original=globalThis.fetch;
  const before=process.env.HASNARIA_GITHUB_TOKEN;
  delete process.env.HASNARIA_GITHUB_TOKEN;
  globalThis.fetch=(async (url:RequestInfo | URL)=>handler(String(url))) as typeof fetch;
  try { await fn(); }
  finally {
    globalThis.fetch=original;
    if(before===undefined)delete process.env.HASNARIA_GITHUB_TOKEN;else process.env.HASNARIA_GITHUB_TOKEN=before;
  }
}
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
test("CI failures are development signals; ignores PRs in GitHub Issues",async()=>{
  const requests:string[]=[];
  await mockedFetch(url=>{
    requests.push(url);
    if(url.includes("/actions/runs"))return json({workflow_runs:[
      {id:123,name:"Audit Gate",head_branch:"fix/stock",status:"completed",conclusion:"failure",html_url:"https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/actions/runs/123",created_at:new Date().toISOString()},
      {id:124,name:"Audit Gate",head_branch:"main",status:"in_progress",conclusion:null,html_url:"https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/actions/runs/124",created_at:new Date().toISOString()},
    ]});
    if(url.includes("/issues?"))return json([
      {number:95,title:"A PR not an issue",pull_request:{url:"present"},html_url:"https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/95"},
      {number:14,title:"Stock desync",updated_at:new Date().toISOString(),html_url:"https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/issues/14"},
    ]);
    if(url==="https://hasnaria-business-analyzer.vercel.app/")return new Response("OK",{status:200});
    throw Error("Unexpected request "+url);
  },async()=>{
    const result=await loadHasnariaActivity();
    assert.equal(result.actionsSource,"live");
    assert.equal(result.issuesSource,"live");
    assert.equal(result.issueCount,1);
    assert.deepEqual(result.signals.map(s=>s.kind),["ci","issue"]);
    assert.ok(result.signals.every(s=>s.scope==="development"));
    assert.equal(result.website.state,"reachable");
    assert.equal(result.website.httpCode,200);
    assert.equal(result.runs.find(r=>r.id===124)?.status,"in_progress");
  });
  assert.equal(requests.length,3);
});
test("unavailable sources are not represented as zero verified errors",async()=>{
  await mockedFetch(url=>{
    if(url.includes("hasnaria-business-analyzer.vercel.app"))return new Response("Service unavailable",{status:503});
    return new Response("rate limited",{status:403});
  },async()=>{
    const result=await loadHasnariaActivity();
    assert.equal(result.actionsSource,"unavailable");
    assert.equal(result.issuesSource,"unavailable");
    assert.deepEqual(result.signals,[]);
    assert.equal(result.website.state,"error");
    assert.equal(result.website.httpCode,503);
  });
});
