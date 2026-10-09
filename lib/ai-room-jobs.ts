import { estimateWanCost, isWanModel } from "./wan-models";

export type AiRoomJobStatus = "Queued" | "Processing" | "Ready" | "Failed";
export type AiRoomMode = "text" | "image";

export type StoredAiRoomJob = {
  id: string;
  prompt: string;
  model: string;
  status: AiRoomJobStatus;
  createdAt?: string;
  created?: string;
  mode?: AiRoomMode;
  duration?: string;
  aspect?: string;
  quality?: string;
  estimatedCostUsd?: number;
  videoUrl?: string;
  videoWidth?: number;
  videoHeight?: number;
  preserveFace?: boolean;
  error?: string;
};

export type CostInput = {
  model: string;
  mode: AiRoomMode;
  duration: string;
  quality: string;
};

// Rate card mirrored from the public fal.ai model pages.
// This is an estimate for UX/budget visibility, not an invoice.
export function estimateWanCostUsd(input: CostInput): number | null {
  if (!isWanModel(input.model)) return null;
  if (input.duration !== "5s" && input.duration !== "10s") return null;
  if (input.quality !== "580p" && input.quality !== "720p" && input.quality !== "1080p") return null;
  return estimateWanCost(input.model, input.mode, input.duration, input.quality);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeStoredJob(value: unknown): StoredAiRoomJob | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.prompt !== "string") return null;
  if (typeof value.model !== "string") return null;
  if (!["Queued", "Processing", "Ready", "Failed"].includes(String(value.status))) return null;

  const inferredMode: AiRoomMode = value.id.includes(":image:") ? "image" : "text";
  const mode: AiRoomMode = value.mode === "image" ? "image" : value.mode === "text" ? "text" : inferredMode;
  const duration = typeof value.duration === "string" ? value.duration : undefined;
  const quality = typeof value.quality === "string" ? value.quality : undefined;
  const estimatedCostUsd =
    typeof value.estimatedCostUsd === "number" && Number.isFinite(value.estimatedCostUsd)
      ? value.estimatedCostUsd
      : duration && quality
        ? estimateWanCostUsd({model: value.model, mode, duration, quality}) ?? undefined
        : value.model === "Wan 2.2 Fast" && mode === "text"
          ? 0.08
          : undefined;

  return {
    id: value.id,
    prompt: value.prompt,
    model: value.model,
    status: value.status as AiRoomJobStatus,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : undefined,
    created: typeof value.created === "string" ? value.created : undefined,
    mode,
    duration,
    aspect: typeof value.aspect === "string" ? value.aspect : undefined,
    quality,
    estimatedCostUsd,
    videoUrl: typeof value.videoUrl === "string" ? value.videoUrl : undefined,
    videoWidth: typeof value.videoWidth === "number" && Number.isInteger(value.videoWidth) && value.videoWidth > 0 ? value.videoWidth : undefined,
    videoHeight: typeof value.videoHeight === "number" && Number.isInteger(value.videoHeight) && value.videoHeight > 0 ? value.videoHeight : undefined,
    preserveFace: value.preserveFace === true,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

export function summarizeUsage(jobs: StoredAiRoomJob[]) {
  const estimatedTotalUsd = Number(
    jobs.reduce((total, job) => total + (job.estimatedCostUsd ?? 0), 0).toFixed(2),
  );
  return {
    jobs: jobs.length,
    ready: jobs.filter(job => job.status === "Ready").length,
    failed: jobs.filter(job => job.status === "Failed").length,
    estimatedTotalUsd,
  };
}

export function formatElapsed(createdAt: string | undefined, now: number): string {
  if (!createdAt) return "";
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return "";
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}
