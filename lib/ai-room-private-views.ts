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

/**
 * An OCI inventory fetch can begin before a paid submission finishes and
 * return after the browser has registered that new job. Never discard that
 * local, server-confirmed job or restore a video just deleted in this session.
 * Once OCI confirms a terminal status, it stays authoritative.
 */
export function reconcilePrivateJobs<T extends PrivateVideoSurfaceJob>(
  remote: readonly T[], current: readonly T[], acceptedIds: ReadonlySet<string>,
  locallyDeletedIds: ReadonlySet<string>,
): T[] {
  const merged=new Map(remote.filter(row=>!locallyDeletedIds.has(row.id)).map(row=>[row.id,row]));
  for(const row of current){
    if(locallyDeletedIds.has(row.id))continue;
    const fromStorage=merged.get(row.id);
    // A just-checked terminal status is newer than a list response that
    // started earlier. Protect historic jobs too, not only this tab's submits.
    if(fromStorage &&
      (row.status==="completed" || row.status==="failed") &&
      (fromStorage.status==="queued" || fromStorage.status==="processing")){
      merged.set(row.id,row);
    }else if(!fromStorage && acceptedIds.has(row.id)){
      merged.set(row.id,row);
    }
  }
  return [...merged.values()].sort((a,b)=>
    createdAtMs(b.createdAt)-createdAtMs(a.createdAt) || b.id.localeCompare(a.id));
}
