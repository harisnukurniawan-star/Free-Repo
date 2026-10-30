import "server-only";
import { contentPolicyRejection, matureContentModeEnabled, type AiRoomContentMode } from "./ai-room-content-policy";

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
  preserveFace?: boolean;
  contentMode: AiRoomContentMode;
  adultConfirmed: boolean;
  imageConsentConfirmed: boolean;
};
export type VideoJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  provider: string;
  createdAt: string;
  videoUrl?: string;
  videoWidth?: number;
  videoHeight?: number;
  error?: string;
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
  const contentMode = option(body.contentMode, ["standard", "mature"], "standard", "content mode");
  if (body.adultConfirmed !== undefined && typeof body.adultConfirmed !== "boolean") {
    throw new VideoEngineError("Invalid adult confirmation.", 400, false);
  }
  const adultConfirmed = body.adultConfirmed === true;
  if (body.imageConsentConfirmed !== undefined && typeof body.imageConsentConfirmed !== "boolean") {
    throw new VideoEngineError("Invalid image consent confirmation.", 400, false);
  }
  const imageConsentConfirmed = body.imageConsentConfirmed === true;
  const policyFailure = contentPolicyRejection(body.prompt);
  if (policyFailure) throw new VideoEngineError(policyFailure, 422, false);
  if (contentMode === "mature") {
    if (!matureContentModeEnabled()) throw new VideoEngineError("Mature content mode is disabled by the server administrator.", 403, false);
    if (!adultConfirmed) throw new VideoEngineError("Confirm you are 18 or older to use mature content mode.", 403, false);
    if (mode === "image" && !imageConsentConfirmed) {
      throw new VideoEngineError("Mature image-to-video requires confirmation that every depicted person is an adult and has given permission to use their likeness.", 403, false);
    }
  }
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
  if (body.preserveFace !== undefined && typeof body.preserveFace !== "boolean") {
    throw new VideoEngineError("Invalid preserve face setting.", 400, false);
  }
  const preserveFace = mode === "image" && body.preserveFace === true;
  return { prompt: body.prompt.trim(), mode, model, duration, aspect, quality, imageUrl, preserveFace, contentMode, adultConfirmed, imageConsentConfirmed };
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

const PROVIDER_SAFETY_REJECTION =
  "The provider blocked this request or reference image under its content safety policy.";

/** Report a safe failure category without revealing raw provider responses. */
function providerFailureReason(result: unknown): string {
  // Inspect only known provider error fields and never echo their raw contents.
  // fal can send errors as strings, typed objects or FastAPI-style detail arrays.
  const hints: string[] = [];
  const collect = (value: unknown, depth: number): void => {
    if (hints.length >= 12 || depth > 3) return;
    if (typeof value === "string") {
      hints.push(value.slice(0, 350));
    } else if (Array.isArray(value)) {
      for (const item of value.slice(0, 5)) collect(item, depth + 1);
    } else if (value && typeof value === "object") {
      const fields = value as Record<string, unknown>;
      for (const field of ["error_type", "code", "type", "error", "detail", "message", "msg", "errors", "loc"]) {
        if (field in fields) collect(fields[field], depth + 1);
      }
    }
  };
  collect(result, 0);
  const hint = hints.join(" ").toLowerCase();

  if (/(?:moderation|content[_ -]?policy|safety[_ -]?check|nsfw|prohibited[_ -]?content|explicit[_ -]?content)/.test(hint)) {
    return PROVIDER_SAFETY_REJECTION;
  }
  if (/(?:image|reference|base64|data[_ -]?uri|mime|file[_ -]?type|file[_ -]?format)/.test(hint) &&
      /(?:invalid|unsupported|malformed|unreadable|too large|decode|failed to load|missing|required|not found)/.test(hint)) {
    return "The provider could not accept the reference image. Check its format, size and readability.";
  }
  if (/(?:validation|invalid[_ -]?input|invalid[_ -]?parameter|schema|unprocessable|unexpected[_ -]?field|value[_ -]?error)/.test(hint)) {
    return "The provider rejected a model setting or invalid input. Review the selected model, ratio, quality and duration.";
  }
  if (/(?:insufficient[_ -]?credit|billing|balance|quota[_ -]?exceeded|payment[_ -]?required)/.test(hint)) {
    return "The provider reported a credit, billing or quota restriction.";
  }
  if (/(?:out[_ -]?of[_ -]?memory|overloaded|internal[_ -]?server|capacity|temporarily unavailable|timeout|timed out)/.test(hint)) {
    return "The provider failed during processing. Check History before considering another paid generation.";
  }
  return "The provider reported a failed generation without a specific reason. Check History before retrying; the provider did not identify a safe failure category.";
}

function providerHttpError(status: number, detail?: unknown): VideoEngineError {
  // Some endpoints use HTTP 403 for content policy rather than API key failure.
  // Classify only recognized safety reasons; all unknown 403 responses remain
  // authentication/configuration failures instead of exposing provider text.
  if (status === 403 && detail !== undefined &&
      providerFailureReason(detail) === PROVIDER_SAFETY_REJECTION) {
    return new VideoEngineError(PROVIDER_SAFETY_REJECTION, 422, false);
  }
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
    return new VideoEngineError(detail === undefined
      ? "The provider rejected this request (HTTP " + status + "). Review the prompt and model settings."
      : providerFailureReason(detail), 422, false);
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

  private client(timeoutMs = 20_000) {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
    const client = createFalClient({
      credentials: this.key,
      // The UI owns retries. Aborting on an error also prevents the SDK's queue
      // submit retries and backup-domain fallback from replaying paid inference.
      fetch: async (url, init) => {
        try {
          signal.throwIfAborted();
          const response = await fetch(url, { ...init, signal, cache: "no-store" });
          if (!response.ok) {
            let details: unknown;
            if ((response.status === 400 || response.status === 403 || response.status === 422) &&
                response.headers.get("content-type")?.includes("application/json")) {
              try {
                const raw = await response.clone().text();
                if (raw.length <= 4096) details = JSON.parse(raw) as unknown;
              } catch { /* Provider did not supply readable error details. */ }
            }
            throw providerHttpError(response.status, details);
          }
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
    // Only guide identity for reference-image mode; this is a best-effort prompt,
    // not a face-recognition or biometric guarantee.
    const keepFace = input.mode === "image" && input.preserveFace === true;
    const scenePrompt = keepFace
      ? `${input.prompt.trim()}\nPreserve the exact appearance of the person in the provided first-frame image: same facial structure, eyes, nose, mouth, skin tone, hair and proportions across all frames. Animate only natural subtle movement; do not change identity, age, or facial features. Keep one continuous shot.`
      : input.prompt;
    const common = {
      prompt: scenePrompt,
      resolution: input.quality,
      // Wan 2.7 first-frame I2V does not accept aspect_ratio. Unlike 2.7 T2V,
      // it derives the output composition from the provided first frame,
      // which the browser has already framed to the selected ratio.
      ...(tier !== "v27" || input.mode === "text" ? { aspect_ratio: input.aspect } : {}),
    };
    const faceAvoid = "altered identity, different face, face morphing, changed facial features, warped eyes, unnatural face, extra facial features";
    let payload: Record<string, string | number | boolean>;
    if (tier === "fast" || tier === "a14b") {
      // Wan 2.2 uses frame counts, not a duration field.
      payload = {
        ...common,
        frames_per_second: tier === "fast" ? 24 : 16,
        num_frames: input.duration === "10s" ? 161 : tier === "fast" ? 121 : 81,
        ...(input.mode === "image" ? { image_url: input.imageUrl! } : {}),
        ...(keepFace ? { enable_prompt_expansion: false, negative_prompt: faceAvoid } : {}),
      };
    } else if (tier === "v27") {
      // Wan 2.7 takes an integer duration and the first frame as image_url.
      payload = { ...common, duration: Number.parseInt(input.duration, 10),
        ...(input.mode === "image" ? { image_url: input.imageUrl! } : {}),
        ...(keepFace ? { enable_prompt_expansion: false, negative_prompt: faceAvoid } : {}) };
    } else {
      // Wan 3.0/Prime take an integer duration and start_image_url.
      payload = { ...common, duration: Number.parseInt(input.duration, 10),
        audio: true, enable_prompt_expansion: !keepFace,
        ...(input.mode === "image" ? { start_image_url: input.imageUrl! } : {}) };
    }
    try {
      // A Base64 reference can be several MB. Give the one-time image queue
      // submission more transport time; do not retry a possibly billed POST.
      const { client, signal } = this.client(input.mode === "image" ? 45_000 : 20_000);
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
        const reason = providerFailureReason(state);
        // Never record user prompts, reference images, raw provider bodies or request IDs in logs.
        console.warn("AI_ROOM_FAL_JOB_FAILED", JSON.stringify({ endpoint, category: reason }));
        return {...this.job(id, "failed"), error: reason};
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
      const width = result?.data?.video?.width;
      const height = result?.data?.video?.height;
      return { ...this.job(id, "completed"), videoUrl,
        videoWidth: Number.isInteger(width) && width > 0 ? width : undefined,
        videoHeight: Number.isInteger(height) && height > 0 ? height : undefined };
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
