import assert from "node:assert/strict";
import test from "node:test";
import {createVideoJobPoller, type PollingUpdate} from "../lib/ai-room-polling";

type Timer = ReturnType<typeof setTimeout>;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

class Clock {
  time = 0;
  sequence = 0;
  timers = new Map<Timer, {at: number; callback: () => void}>();
  now = () => this.time;
  setTimer = (callback: () => void, delay: number): Timer => {
    const timer = ++this.sequence as unknown as Timer;
    this.timers.set(timer, {at: this.time + delay, callback});
    return timer;
  };
  clearTimer = (timer: Timer) => {this.timers.delete(timer);};
  async advance(milliseconds: number) {
    const end = this.time + milliseconds;
    for (;;) {
      const next = [...this.timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    this.time = end;
    await flush();
  }
}

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
const job = (status: string, videoUrl?: string) => response({job: {status, videoUrl}});

function setup(fetchStatus: typeof fetch) {
  const clock = new Clock();
  const updates: Array<{id: string; update: PollingUpdate}> = [];
  const poller = createVideoJobPoller((id, update) => updates.push({id, update}), {fetchStatus, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer});
  return {clock, updates, poller};
}

test("old job IDs progress queued -> processing -> ready with a video, then polling stops", async t => {
  const statuses = [job("queued"), job("processing"), job("completed", "https://example.com/video.mp4")];
  const requests: string[] = [];
  const {clock, updates, poller} = setup(async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.method, undefined, "polling must never submit a generation");
    return statuses.shift()!;
  });
  t.after(() => poller.stop());
  poller.setPendingJobs(["fast:text:old-request"]);
  await clock.advance(6_000);
  assert.deepEqual(updates.map(item => item.update.status), ["queued", "processing", "completed"]);
  assert.equal(updates[2].update.videoUrl, "https://example.com/video.mp4");
  assert.equal(requests[0], "/api/ai-room/generate/fast%3Atext%3Aold-request");
  await clock.advance(60_000);
  assert.equal(requests.length, 3);
  assert.equal(clock.timers.size, 0);
});

test("React updates to pending jobs retain the interval and requests stay serial", async t => {
  let finishFirst: (value: Response) => void = () => {throw new Error("No active request");};
  const requests: string[] = [];
  const {clock, poller} = setup(async url => {
    requests.push(String(url));
    if (requests.length === 1) return new Promise<Response>(resolve => {finishFirst = resolve;});
    return job("processing");
  });
  t.after(() => poller.stop());
  poller.setPendingJobs(["first", "second"]);
  await clock.advance(0);
  poller.setPendingJobs(["first", "second", "third"]);
  await clock.advance(5_000);
  assert.equal(requests.length, 1, "an in-flight status request prevents overlapping polls");
  finishFirst(job("processing"));
  await flush();
  assert.equal(requests.length, 3);
  poller.setPendingJobs(["first", "second", "third"]);
  await clock.advance(2_999);
  assert.equal(requests.length, 3, "job state updates cannot immediately restart polling");
  await clock.advance(1);
  assert.equal(requests.length, 6);
});

test("transient errors preserve processing and back off from 3 seconds to a 30 second cap", async t => {
  const callTimes: number[] = [];
  let count = 0;
  const {clock, updates, poller} = setup(async () => {
    callTimes.push(clock.time);
    count += 1;
    if (count === 1 || count === 8) return job("processing");
    if (count === 2) return response({error: "Provider busy.", retryable: true}, 429);
    if (count === 3) throw new TypeError("network failure");
    if (count === 4) return new Response("<html>Gateway error</html>", {status: 502});
    return response({error: "Provider unavailable.", retryable: true}, 503);
  });
  t.after(() => poller.stop());
  poller.setPendingJobs(["processing-job"]);
  await clock.advance(108_000);
  assert.deepEqual(callTimes, [0, 3_000, 6_000, 12_000, 24_000, 48_000, 78_000, 108_000]);
  assert.equal(updates[0].update.status, "processing");
  assert.ok(updates.slice(1, 7).every(item => item.update.status === undefined));
  assert.match(updates[6].update.error!, /Retrying in 30s/);
  assert.equal(updates[7].update.status, "processing");
  assert.equal(updates[7].update.error, undefined, "a successful status clears the temporary error");
  await clock.advance(3_000);
  assert.equal(callTimes[8], 111_000, "a successful status resets the retry delay");
  assert.match(updates[8].update.error!, /Retrying in 3s/);
});

test("permanent API errors and provider failures stop polling and keep a job-specific error", async t => {
  let calls = 0;
  const {clock, updates, poller} = setup(async url => {
    calls += 1;
    return String(url).endsWith("invalid")
      ? response({error: "The request was not found.", retryable: false}, 404)
      : response({job: {status: "failed", error: "Provider rejected the input."}});
  });
  t.after(() => poller.stop());
  poller.setPendingJobs(["invalid", "failed"]);
  await clock.advance(60_000);
  assert.equal(calls, 2);
  assert.deepEqual(updates, [
    {id: "invalid", update: {status: "failed", error: "The request was not found."}},
    {id: "failed", update: {status: "failed", videoUrl: undefined, error: "Provider rejected the input."}},
  ]);
  assert.equal(clock.timers.size, 0);
});

test("a completed job without a video reports an actionable failure", async t => {
  const {clock, updates, poller} = setup(async () => job("completed"));
  t.after(() => poller.stop());
  poller.setPendingJobs(["missing-video"]);
  await clock.advance(60_000);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.status, "failed");
  assert.match(updates[0].update.error!, /without a playable video/);
});

test("unmount aborts the active fetch and prevents late updates and timers", async () => {
  let signal: AbortSignal | null | undefined;
  const {clock, updates, poller} = setup(async (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("Aborted"))));
  });
  poller.setPendingJobs(["pending"]);
  await clock.advance(0);
  poller.stop();
  await flush();
  assert.equal(signal?.aborted, true);
  assert.equal(updates.length, 0);
  assert.equal(clock.timers.size, 0);
  await clock.advance(60_000);
  assert.equal(updates.length, 0);
});

test("a hung request times out and retries without failing the generation", async t => {
  let calls = 0;
  const {clock, updates, poller} = setup(async (_url, init) => {
    calls += 1;
    if (calls > 1) return job("completed", "https://example.com/video.mp4");
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("Timeout"))));
  });
  t.after(() => poller.stop());
  poller.setPendingJobs(["slow"]);
  await clock.advance(20_000);
  assert.equal(updates[0].update.status, undefined);
  assert.match(updates[0].update.error!, /Retrying in 3s/);
  await clock.advance(3_000);
  assert.equal(calls, 2);
  assert.equal(updates[1].update.status, "completed");
});
