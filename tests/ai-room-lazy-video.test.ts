import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";

// The CI uses --conditions=react-server and cannot execute react-dom/server.
// Guard the client-only lazy media contract at the source level.
test("private Gallery player does not mount a src-bearing video before Play",()=>{
  const source=readFileSync(join(process.cwd(),
    "app","ai-room","PrivateVideoPlayer.tsx"),"utf8");
  assert.match(source,/if\(activated\)return <video src=\{src\}/);
  assert.match(source,/return <button type="button"/);
  assert.match(source,/onClick=\{\(\)=>setActivated\(true\)\}/);
  assert.match(source,/preload="metadata"/);
  assert.doesNotMatch(source,/preload="auto"/);
});
