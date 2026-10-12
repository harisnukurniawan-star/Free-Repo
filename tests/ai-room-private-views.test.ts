import assert from "node:assert/strict";
import test from "node:test";
import {privateVideoSurfaces,reconcilePrivateJobs, type PrivateVideoSurfaceJob} from "../lib/ai-room-private-views";

const now = "2026-10-12T00:01:00Z";
const earlier = "2026-10-11T23:00:00Z";
const job = (id: string, status: PrivateVideoSurfaceJob["status"], createdAt = now, videoUrl?: string):
  PrivateVideoSurfaceJob => ({id, status, createdAt, videoUrl});

test("failed generate never adds a recent, gallery or preview item", () => {
  const views=privateVideoSurfaces([
    job("provider-failure", "failed", now),
    job("rejected-after-provider", "failed", earlier, "/api/ai-room/videos/rejected/stream"),
  ]);
  assert.deepEqual(views.gallery, []);
  assert.deepEqual(views.recent, []);
  assert.equal(views.preview, null);
  assert.deepEqual(views.pending, []);
  assert.deepEqual(views.history.map(x=>x.id), ["provider-failure", "rejected-after-provider"]);
});

test("failed or pending attempts do not replace the previous successful video", () => {
  const success=job("successful-video","completed",earlier,"/api/ai-room/videos/successful/stream");
  const result=privateVideoSurfaces([
    success,
    job("newer-failed","failed","2026-10-12T01:00:00Z"),
    job("newer-queued","queued","2026-10-12T02:00:00Z"),
    job("newer-processing","processing","2026-10-12T03:00:00Z"),
  ]);
  assert.equal(result.preview?.id, success.id);
  assert.deepEqual(result.recent.map(x=>x.id), [success.id]);
  assert.deepEqual(result.gallery.map(x=>x.id), [success.id]);
  assert.deepEqual(result.pending.map(x=>x.id), ["newer-processing","newer-queued"]);
  assert.equal(result.history.length,4);
});

test("completed but unplayable metadata cannot enter Gallery or Preview", () => {
  const result=privateVideoSurfaces([
    job("no-video-url","completed","2026-10-12T03:00:00Z"),
    job("empty-url","completed","2026-10-12T02:00:00Z",""),
    job("valid-video","completed",earlier,"/api/ai-room/videos/ok/stream"),
  ]);
  assert.deepEqual(result.gallery.map(x=>x.id),["valid-video"]);
  assert.equal(result.preview?.id,"valid-video");
});

test("recent shows only eight newest completed videos regardless of list order", () => {
  const jobs=Array.from({length:10},(_,i)=>job("completed-"+i,"completed",
    new Date(Date.UTC(2026,9,11,10,i)).toISOString(),"/api/ai-room/videos/"+i+"/stream"));
  const surfaces=privateVideoSurfaces(jobs);
  assert.equal(surfaces.gallery.length,10);
  assert.equal(surfaces.recent.length,8);
  assert.equal(surfaces.preview?.id,"completed-9");
  assert.deepEqual(surfaces.recent.map(j=>j.id),jobs.slice(2).reverse().map(j=>j.id));
  assert.equal(jobs[0].id,"completed-0","selection must not mutate source array");
});

test("a late Gallery response must not erase an accepted paid image-to-video job",()=>{
  const existing=job("old-success","completed","2026-10-11T21:00:00Z","/api/ai-room/videos/old/stream");
  const justAccepted=job("paid-image-job","queued","2026-10-12T02:00:00Z");
  const merged=reconcilePrivateJobs([existing],[justAccepted,existing],
    new Set(["paid-image-job"]),new Set<string>());
  assert.deepEqual(merged.map(item=>item.id),["paid-image-job","old-success"]);
  assert.deepEqual(privateVideoSurfaces(merged).pending.map(item=>item.id),["paid-image-job"]);
});

test("stale OCI queued status cannot overwrite a terminal provider status",()=>{
  const local=job("image-success","completed",now,"/api/ai-room/videos/new/stream");
  const slowRemote=job("image-success","queued",now);
  const merged=reconcilePrivateJobs([slowRemote],[local],new Set(["image-success"]),new Set<string>());
  assert.equal(merged[0].status,"completed");
  assert.equal(merged[0].videoUrl,local.videoUrl);
});

test("late Gallery list cannot resurrect a successfully deleted private video",()=>{
  const stale=job("deleted-video","completed",now,"/api/ai-room/videos/deleted/stream");
  const merged=reconcilePrivateJobs([stale],[stale],new Set(["deleted-video"]),new Set(["deleted-video"]));
  assert.deepEqual(merged,[]);
});

test("Gallery remains authoritative for jobs not accepted in this browser session",()=>{
  const outdated=job("old","queued",now);
  const saved=job("old","completed",now,"/api/ai-room/videos/old/stream");
  const merged=reconcilePrivateJobs([saved],[outdated],new Set<string>(),new Set<string>());
  assert.equal(merged[0].status,"completed");
  assert.equal(merged[0].videoUrl,saved.videoUrl);
});
