import assert from "node:assert/strict";
import test from "node:test";
import {
  historyRequestAuthorized,
  historyStoreConfigured,
} from "../lib/ai-room-history-store";

function preserveEnv(t:test.TestContext){
  const keys=["AI_ROOM_HISTORY_MODE","BLOB_READ_WRITE_TOKEN","AI_ROOM_HISTORY_ACCESS_KEY"] as const;
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  t.after(()=>{
    for(const key of keys){
      const value=original[key];
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
  });
}

test("server history stays disabled by default", t=>{
  preserveEnv(t);
  delete process.env.AI_ROOM_HISTORY_MODE;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.AI_ROOM_HISTORY_ACCESS_KEY;
  assert.equal(historyStoreConfigured(),false);
});

test("server history requires mode, blob token, and access key", t=>{
  preserveEnv(t);
  process.env.AI_ROOM_HISTORY_MODE="blob";
  process.env.BLOB_READ_WRITE_TOKEN="blob-test";
  delete process.env.AI_ROOM_HISTORY_ACCESS_KEY;
  assert.equal(historyStoreConfigured(),false);
  process.env.AI_ROOM_HISTORY_ACCESS_KEY="history-secret";
  assert.equal(historyStoreConfigured(),true);
});

test("history request authorization requires the exact access key", t=>{
  preserveEnv(t);
  process.env.AI_ROOM_HISTORY_ACCESS_KEY="history-secret";
  const good=new Request("https://example.test/api/ai-room/jobs",{headers:{"x-ai-room-history-key":"history-secret"}});
  const bad=new Request("https://example.test/api/ai-room/jobs",{headers:{"x-ai-room-history-key":"wrong-secret"}});
  assert.equal(historyRequestAuthorized(good),true);
  assert.equal(historyRequestAuthorized(bad),false);
});

test("history authorization rejects missing keys safely", t=>{
  preserveEnv(t);
  process.env.AI_ROOM_HISTORY_ACCESS_KEY="history-secret";
  assert.equal(historyRequestAuthorized(new Request("https://example.test")),false);
  delete process.env.AI_ROOM_HISTORY_ACCESS_KEY;
  assert.equal(historyRequestAuthorized(new Request("https://example.test",{headers:{"x-ai-room-history-key":"history-secret"}})),false);
});
