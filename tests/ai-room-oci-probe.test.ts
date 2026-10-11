import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {join} from "node:path";

const script=join(process.cwd(),"scripts","verify-oci-native.mjs");
const credentials={
  AI_ROOM_OCI_TENANCY_ID:"ocid1.tenancy.oc1..nonexistent_test",
  AI_ROOM_OCI_USER_ID:"ocid1.user.oc1..nonexistent_test",
  AI_ROOM_OCI_KEY_FINGERPRINT:"aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa",
  AI_ROOM_OCI_PRIVATE_KEY:"NOT_REAL_TEST_KEY",
  AI_ROOM_OCI_NAMESPACE:"test-namespace",
  AI_ROOM_OCI_DRIVER:"native"
};
function run(args:string[],overrides:Record<string,string>={}){
  const result=spawnSync(process.execPath,[script,...args],{
    env:{...process.env,...credentials,...overrides},
    timeout:10000,encoding:"utf8"
  });
  assert.equal(result.error,undefined);
  return result;
}
test("production probe refuses Preview bucket before any OCI request",()=>{
  const x=run(["--production-probe"],{
    VERCEL_ENV:"production",
    AI_ROOM_OCI_BUCKET:"ai-room-private-videos"
  });
  assert.equal(x.status,1);
  assert.match(x.stderr,/Production probe refused a bucket/);
  assert.doesNotMatch(x.stdout,/PASS:/);
  assert.doesNotMatch(x.stderr,/NOT_REAL_TEST_KEY|nonexistent_test/);
});
test("production probe refuses Preview environment even with Production bucket",()=>{
  const x=run(["--production-probe"],{
    VERCEL_ENV:"preview",
    AI_ROOM_OCI_BUCKET:"ai-room-private-videos-prod"
  });
  assert.equal(x.status,1);
  assert.match(x.stderr,/cannot run with a Preview environment/);
  assert.doesNotMatch(x.stdout,/PASS:/);
});
test("Preview probe refuses Production environment",()=>{
  const x=run(["--probe"],{
    VERCEL_ENV:"production",
    AI_ROOM_OCI_BUCKET:"ai-room-private-videos-prod"
  });
  assert.equal(x.status,1);
  assert.match(x.stderr,/Preview probe refused/);
});
test("Production mode requires Native driver",()=>{
  const x=run(["--production-probe"],{
    VERCEL_ENV:"production",
    AI_ROOM_OCI_BUCKET:"ai-room-private-videos-prod",
    AI_ROOM_OCI_DRIVER:"s3"
  });
  assert.equal(x.status,1);
  assert.match(x.stderr,/Native OCI driver is required/);
});
test("No executable probe mode is rejected without OCI mutation",()=>{
  const x=run([],{
    VERCEL_ENV:"production",
    AI_ROOM_OCI_BUCKET:"ai-room-private-videos-prod"
  });
  assert.equal(x.status,1);
  assert.match(x.stderr,/Choose --probe or --production-probe/);
});
