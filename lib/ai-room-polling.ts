export type PollingUpdate = {
  status?: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  videoWidth?: number;
  videoHeight?: number;
  error?: string;
};

type Timer = ReturnType<typeof setTimeout>;
type PollingOptions = {
  fetchStatus?: typeof fetch;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
};

const POLL_DELAY = 3_000;
const MAX_RETRY_DELAY = 30_000;
const REQUEST_TIMEOUT = 20_000;

class StatusError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readStatus(response: Response): Promise<PollingUpdate> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Gateways may return an empty body or HTML during a temporary outage.
    throw new StatusError("The status service returned an unreadable response.", true);
  }
  if (!isObject(data)) throw new StatusError("The status service returned an invalid response.", true);
  if (!response.ok) {
    const retryable = typeof data.retryable === "boolean"
      ? data.retryable
      : response.status === 408 || response.status === 429 || response.status >= 500;
    throw new StatusError(typeof data.error === "string" ? data.error : "Unable to read generation status.", retryable);
  }
  const job = data.job;
  if (!isObject(job) || !["queued", "processing", "completed", "failed"].includes(String(job.status))) {
    throw new StatusError("The status service returned an invalid job status.", true);
  }
  if (job.status === "completed" && (typeof job.videoUrl !== "string" || !job.videoUrl)) {
    return {status: "failed", error: "Generation completed without a playable video. Please check this request with the provider."};
  }
  return {
    status: job.status as PollingUpdate["status"],
    videoUrl: typeof job.videoUrl === "string" ? job.videoUrl : undefined,
    ...(typeof job.videoWidth === "number" && Number.isInteger(job.videoWidth) && job.videoWidth > 0 ? {videoWidth: job.videoWidth} : {}),
    ...(typeof job.videoHeight === "number" && Number.isInteger(job.videoHeight) && job.videoHeight > 0 ? {videoHeight: job.videoHeight} : {}),
    error: job.status === "failed"
      ? typeof job.error === "string" ? job.error : "Video generation failed."
      : undefined,
  };
}

/** One serial request loop, retaining retry schedules when React updates a job. */
export function createVideoJobPoller(
  onUpdate: (id: string, update: PollingUpdate) => void,
  options: PollingOptions = {},
) {
  const fetchStatus = options.fetchStatus ?? fetch;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const pending = new Map<string, {nextAt: number; failures: number}>();
  let timer: Timer | undefined;
  let activeRequest: AbortController | undefined;
  let stopped = false;
  let running = false;

  function schedule() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    if (stopped || running || !pending.size) return;
    const nextAt = Math.min(...Array.from(pending.values(), item => item.nextAt));
    timer = setTimer(() => {timer = undefined; void poll();}, Math.max(0, nextAt - now()));
  }

  async function poll() {
    if (stopped || running) return;
    running = true;
    try {
      for (const [id, item] of pending) {
        if (stopped) return;
        if (item.nextAt > now()) continue;
        const controller = new AbortController();
        activeRequest = controller;
        const timeout = setTimer(() => controller.abort(), REQUEST_TIMEOUT);
        try {
          const response = await fetchStatus(`/api/ai-room/generate/${encodeURIComponent(id)}`, {
            cache: "no-store", signal: controller.signal,
          });
          const update = await readStatus(response);
          if (stopped || pending.get(id) !== item) continue;
          item.failures = 0;
          item.nextAt = now() + POLL_DELAY;
          if (update.status === "completed" || update.status === "failed") pending.delete(id);
          onUpdate(id, update);
        } catch (error) {
          if (stopped || pending.get(id) !== item) continue;
          const failure = error instanceof StatusError
            ? error
            : new StatusError("Could not reach the status service.", true);
          if (!failure.retryable) {
            pending.delete(id);
            onUpdate(id, {status: "failed", error: failure.message});
          } else {
            item.failures += 1;
            const delay = Math.min(POLL_DELAY * 2 ** Math.min(item.failures - 1, 4), MAX_RETRY_DELAY);
            item.nextAt = now() + delay;
            // Leave Queued/Processing intact while the provider is unavailable.
            onUpdate(id, {error: `${failure.message} Retrying in ${delay / 1_000}s.`});
          }
        } finally {
          clearTimer(timeout);
          activeRequest = undefined;
        }
      }
    } finally {
      running = false;
      schedule();
    }
  }

  return {
    setPendingJobs(ids: string[]) {
      if (stopped) return;
      const retained = new Set(ids);
      for (const id of pending.keys()) if (!retained.has(id)) pending.delete(id);
      for (const id of retained) if (!pending.has(id)) pending.set(id, {nextAt: now(), failures: 0});
      schedule();
    },
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      activeRequest?.abort();
      pending.clear();
    },
  };
}
