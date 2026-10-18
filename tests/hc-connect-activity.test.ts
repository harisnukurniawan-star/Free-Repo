import assert from "node:assert/strict";
import test from "node:test";
import { loadHcActivity } from "../lib/hc-connect-activity";

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
async function withMock(handler: (url: string) => Response, callback: () => Promise<void>) {
  const previousFetch = globalThis.fetch;
  const keys = ["HC_CONNECT_GITHUB_TOKEN", "HC_CONNECT_VERCEL_TOKEN"] as const;
  const previous = keys.map(key => process.env[key]);
  keys.forEach(key => delete process.env[key]);
  globalThis.fetch = (async (req: RequestInfo | URL) => handler(String(req))) as typeof fetch;
  try { await callback(); } finally {
    globalThis.fetch = previousFetch;
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
}
test("HC Overview reads its own project, classifies errors and backlog, without touching data", async () => {
  const requests: string[] = [];
  await withMock(url => {
    requests.push(url);
    if (url.includes("/pulls?")) return json([{number:397,title:"Fix mission bootstrap",updated_at:"2026-10-18T06:00:00Z",html_url:"https://github.com/jakgunn20-maker/hcbp-hub/pull/397"}]);
    if (url.includes("/actions/runs")) return json({workflow_runs:[
      {id:15,name:"API latency watch",head_branch:"main",status:"completed",conclusion:"success",created_at:new Date().toISOString(),html_url:"https://github.com/jakgunn20-maker/hcbp-hub/actions/runs/15"},
      {id:14,name:"Build HC",head_branch:"feature/test",status:"completed",conclusion:"failure",created_at:new Date().toISOString(),html_url:"https://github.com/jakgunn20-maker/hcbp-hub/actions/runs/14"}
    ]});
    if(url.includes("/issues?"))return json([
      {number:13,title:"Permission issue",updated_at:new Date().toISOString(),html_url:"https://github.com/jakgunn20-maker/hcbp-hub/issues/13"},
      {number:397,title:"PR must be excluded",pull_request:{url:"present"},html_url:"https://github.com/jakgunn20-maker/hcbp-hub/pull/397"}]);
    if(url.includes("/commits?"))return json([{sha:"abcdef012345",commit:{message:"Fix header",committer:{date:new Date().toISOString()}},html_url:"https://github.com/jakgunn20-maker/hcbp-hub/commit/abcdef012345"}]);
    if(url==="https://hcconnect.site/")return new Response("OK",{status:200});
    throw Error("Unexpected outbound request: "+url);
  }, async()=>{
    const d=await loadHcActivity();
    assert.equal(d.website.state,"online");
    assert.equal(d.github.prsSource,"live");
    assert.equal(d.github.issuesCount,1);
    assert.equal(d.github.prs.length,1);
    assert.deepEqual(d.signals.map(s=>s.category).sort(),["backlog","error","issue"]);
    assert.equal(d.vercel.source,"unavailable");
    assert.equal(d.vercel.failedPreviews,0);
  });
  assert.equal(requests.length,5);
  assert.ok(requests.every(u=>u.includes("github.com")||u==="https://hcconnect.site/"));
});
test("Failed monitoring never appears as zero confirmed bugs or healthy website", async()=>{
  await withMock(url=> url==="https://hcconnect.site/" ? new Response("Down",{status:503}) : new Response("Rate limit",{status:403}),async()=>{
    const d=await loadHcActivity();
    assert.equal(d.github.runsSource,"snapshot");
    assert.equal(d.github.issuesSource,"snapshot");
    assert.equal(d.website.state,"error");
    assert.equal(d.website.code,503);
    assert.equal(d.github.prs.length,7);
    assert.ok(d.signals.some(s=>s.category==="backlog"));
    assert.ok(d.signals.some(s=>s.id==="site-http"));
  });
});
