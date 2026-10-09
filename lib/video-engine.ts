import "server-only";

import { ApiError, createFalClient } from "@fal-ai/client";
import { WAN_CATALOG, WAN_MODEL_NAMES, wanEndpointFor, isWanModel, type WanDuration, type WanModel, type WanQuality } from "./wan-models";
export { wanEndpointFor } from "./wan-models";

export type VideoRequest = {
  prompt: string;
  mode: "text" | "image";
  model: WanModel;
  duration: WanDuration;
  aspect: "16:9" | "9:16" | "1:1";
  quality: WanQuality;
  imageUrl?: string;
};
export type VideoJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  provider: string;
  createdAt: string;
  videoUrl?: string;
};
export interface VideoEngine {
  name: string;
  submit(input: VideoRequest): Promise<VideoJob>;
  status(id: string): Promise<VideoJob>;
}

// These messages are safe for the browser. Never forward provider bodies or keys.
export class VideoEngineError extends Error {
  constructor(message: string, public readonly httpStatus: number, public readonly retryable: boolean) {
    super(message);
    this.name = "VideoEngineError";
  }
}

const ENDPOINTS = {
  fast: WAN_CATALOG["Wan 2.2 Fast"],
  a14b: WAN_CATALOG["Wan 2.2 14B"],
  v27: WAN_CATALOG["Wan 2.7"],
  v3: WAN_CATALOG["Wan 3.0"],
  v3prime: WAN_CATALOG["Wan 3.0 Prime"],
} as const;
type Tier = keyof typeof ENDPOINTS;

const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function option<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new VideoEngineError(`Unsupported ${label}.`, 400, false);
  }
  return value as T;
}

export function parseVideoRequest(value: unknown): VideoRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VideoEngineError("Invalid generation request.", 400, false);
  }
  const body = value as Record<string, unknown>;
  if (typeof body.prompt !== "string" || body.prompt.trim().length < 3) {
    throw new VideoEngineError("Prompt must contain at least 3 characters.", 400, false);
  }
  const mode = option(body.mode, ["text", "image"], "text", "generation mode");
  const model = body.model === undefined ? WAN_MODEL_NAMES[0] : body.model;
  if (!isWanModel(model)) throw new VideoEngineError("Unsupported model.", 400, false);
  const duration = option(body.duration, ["5s", "10s"], "5s", "duration");
  const aspect = option(body.aspect, ["16:9", "9:16", "1:1"], "16:9", "aspect ratio");
  const quality = option(body.quality, ["580p", "720p", "1080p"], "720p", "resolution");
  if (!(WAN_CATALOG[model].durations as readonly string[]).includes(duration)) {
    throw new VideoEngineError("Unsupported duration for this model.", 400, false);
  }
  if (!(WAN_CATALOG[model].qualities as readonly string[]).includes(quality)) {
    throw new VideoEngineError("Unsupported resolution for this model.", 400, false);
  }
  let imageUrl: string | undefined;
  if (mode === "image") {
    if (typeof body.imageUrl !== "string") {
      throw new VideoEngineError("Reference image is required.", 400, false);
    }
    if (body.imageUrl.length > 3_500_000) {
      throw new VideoEngineError("Reference image is too large.", 413, false);
    }
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.imageUrl)) {
      throw new VideoEngineError("Reference image must be a JPG, PNG, or WEBP image.", 400, false);
    }
    imageUrl = body.imageUrl;
  }
  return { prompt: body.prompt.trim(), mode, model, duration, aspect, quality, imageUrl };
}

function parseJobId(id: string) {
  const parts = id.split(":");
  // Early versions stored a raw request ID for the default Fast text endpoint.
  const [tier, mode, requestId] = parts.length === 1 ? ["fast", "text", id] : parts;
  if ((parts.length !== 1 && parts.length !== 3) ||
      !Object.prototype.hasOwnProperty.call(ENDPOINTS, tier) ||
      (mode !== "text" && mode !== "image") || !REQUEST_ID.test(requestId ?? "")) {
    throw new VideoEngineError("Invalid video job ID.", 400, false);
  }
  return { endpoint: ENDPOINTS[tier as Tier][mode], requestId };
}

function providerHttpError(status: number): VideoEngineError {
  if (status === 401 || status === 403) {
    return new VideoEngineError("Video provider authentication failed. Check the server configuration.", 503, false);
  }
  if (status === 404 || status === 410) {
    return new VideoEngineError("Video job was not found or has expired.", 404, false);
  }
  if (status === 429) return new VideoEngineError("Video provider is busy. Please try again shortly.", 429, true);
  if (status === 408 || status === 504) return new VideoEngineError("Video provider timed out. Please try again shortly.", 504, true);
  if (status >= 500) return new VideoEngineError("Video provider is temporarily unavailable.", 502, true);
  if (status === 400 || status === 422) {
    return new VideoEngineError("Video generation failed. The provider rejected the request.", 422, false);
  }
  return new VideoEngineError("Video provider could not process this request.", 502, false);
}

export function videoEngineError(error: unknown): VideoEngineError {
  if (error instanceof VideoEngineError) return error;
  if (error instanceof ApiError) return providerHttpError(error.status);
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new VideoEngineError("Video provider timed out. Please try again shortly.", 504, true);
  }
  if (error instanceof TypeError) {
    return new VideoEngineError("Unable to reach the video provider. Please try again shortly.", 503, true);
  }
  if (error instanceof SyntaxError) {
    return new VideoEngineError("Video provider returned an unreadable response. Please try again shortly.", 502, true);
  }
  return new VideoEngineError("Unable to process the video request.", 500, false);
}

function validVideoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

class DevelopmentEngine implements VideoEngine {
  name = "development";
  async submit(): Promise<VideoJob> {
    throw new VideoEngineError("Real video generation is not configured. Connect fal.ai before generating a video.", 503, false);
  }
  async status(): Promise<VideoJob> {
    throw new VideoEngineError("Video generation is not configured. Saved jobs can resume when the provider is connected.", 503, true);
  }
}

class FalWanEngine implements VideoEngine {
  name = "fal-wan";

  constructor(private readonly key: string) {}

  private client() {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
    const client = createFalClient({
      credentials: this.key,
      // The UI owns retries. Aborting on an error also prevents the SDK's queue
      // submit retries and backup-domain fallback from replaying paid inference.
      fetch: async (url, init) => {
        try {
          signal.throwIfAborted();
          const response = await fetch(url, { ...init, signal, cache: "no-store" });
          if (!response.ok) throw providerHttpError(response.status);
          return response;
        } catch (error) {
          controller.abort();
          throw videoEngineError(error);
        }
      },
    });
    return { client, signal };
  }

  async submit(value: VideoRequest): Promise<VideoJob> {
    const input = parseVideoRequest(value);
    const tier = WAN_CATALOG[input.model].tier;
    const endpoint = wanEndpointFor(input.model, input.mode);
    const common = {
      prompt: input.prompt,
      resolution: input.quality,
      aspect_ratio: input.aspect,
    };
    let payload: Record<string, string | number | boolean>;
    if (tier === "fast" || tier === "a14b") {
      // Wan 2.2 uses frame counts, not a duration field.
      payload = {
        ...common,
        frames_per_second: tier === "fast" ? 24 : 16,
        num_frames: input.duration === "10s" ? 161 : tier === "fast" ? 121 : 81,
        ...(input.mode === "image" ? { image_url: input.imageUrl! } : {}),
      };
    } else if (tier === "v27") {
      // Wan 2.7 takes an integer duration and the first frame as image_url.
      payload = { ...common, duration: Number.parseInt(input.duration, 10),
        ...(input.mode === "image" ? { image_url: input.imageUrl! } : {}) };
    } else {
      // Wan 3.0/Prime take an integer duration and start_image_url.
      payload = { ...common, duration: Number.parseInt(input.duration, 10),
        audio: true, enable_prompt_expansion: true,
        ...(input.mode === "image" ? { start_image_url: input.imageUrl! } : {}) };
    }
    try {
      const { client, signal } = this.client();
      const queued = await client.queue.submit(endpoint, { input: payload, abortSignal: signal });
      if (!queued || !REQUEST_ID.test(queued.request_id ?? "")) {
        throw new VideoEngineError("Video provider did not return a valid job ID.", 502, false);
      }
      return this.job(`${tier}:${input.mode}:${queued.request_id}`, "queued");
    } catch (error) {
      const safeError = videoEngineError(error);
      // A lost response may follow a successful submission. Never resubmit it
      // automatically; the browser can still retry read-only status requests.
      throw new VideoEngineError(`${safeError.message} Submission was not retried.`, safeError.httpStatus, safeError.retryable);
    }
  }

  async status(id: string): Promise<VideoJob> {
    const { endpoint, requestId } = parseJobId(id);
    try {
      const { client } = this.client();
      const state = await client.queue.status(endpoint, { requestId, logs: false });
      if (!state || typeof state !== "object") {
        throw new VideoEngineError("Video provider returned an invalid status. Please try again shortly.", 502, true);
      }
      if (state.status === "IN_QUEUE") return this.job(id, "queued");
      if (state.status === "IN_PROGRESS") return this.job(id, "processing");
      // Current queue responses can include errors on COMPLETED, while older
      // saved requests may report FAILED. Neither is a usable video result.
      if (("error" in state && state.error) || ("error_type" in state && state.error_type) || String(state.status) === "FAILED") {
        return this.job(id, "failed");
      }
      if (state.status !== "COMPLETED") {
        throw new VideoEngineError("Video provider returned an unknown status. Please try again shortly.", 502, true);
      }
      const result = await client.queue.result(endpoint, { requestId });
      // queue.result wraps the official model payload in { data, requestId }.
      const videoUrl = result?.data?.video?.url;
      if (!validVideoUrl(videoUrl)) {
        throw new VideoEngineError("The completed video job did not contain a valid video URL.", 502, false);
      }
      return { ...this.job(id, "completed"), videoUrl };
    } catch (error) {
      throw videoEngineError(error);
    }
  }

  private job(id: string, status: VideoJob["status"]): VideoJob {
    return { id, status, provider: this.name, createdAt: new Date().toISOString() };
  }
}

export function getVideoEngine(): VideoEngine {
  const provider = process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase();
  if (!provider || provider === "development") return new DevelopmentEngine();
  if (provider !== "fal") throw new VideoEngineError("Unsupported video provider. Check the server configuration.", 503, false);
  const key = process.env.AI_ROOM_FAL_KEY;
  if (!key) throw new VideoEngineError("Video provider credentials are missing. Check the server configuration.", 503, false);
  return new FalWanEngine(key);
}
