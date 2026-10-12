/** Centralized presentation rules for OCI-backed AI ROOM videos.
 * Provider attempts remain available in History, but a failed/queued job must
 * never appear as a saved video in Recent, Gallery, or Preview.
 */
export type PrivateVideoSurfaceJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "deleted";
  createdAt: string;
  videoUrl?: string;
};

function createdAtMs(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function privateVideoSurfaces<T extends PrivateVideoSurfaceJob>(jobs: readonly T[]) {
  const history = jobs.filter(job=>job.status!=="deleted").sort((a, b) =>
    createdAtMs(b.createdAt) - createdAtMs(a.createdAt) || b.id.localeCompare(a.id)
  );
  // Completed metadata without a playable URL must not be shown as a video.
  // Server-issued URLs are only produced after the MP4 has been saved in OCI.
  const gallery = history.filter(job => job.status === "completed" &&
    typeof job.videoUrl === "string" && job.videoUrl.length > 0);
  const pending = history.filter(job => job.status === "queued" || job.status === "processing");
  return {
    gallery,
    recent: gallery.slice(0, 8),
    preview: gallery[0] ?? null,
    pending,
    history,
  };
}
