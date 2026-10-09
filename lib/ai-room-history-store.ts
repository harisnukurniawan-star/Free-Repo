import "server-only";

import { timingSafeEqual } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import { normalizeStoredJob, type StoredAiRoomJob } from "@/lib/ai-room-jobs";

const PREFIX = "ai-room/history/";

export function historyStoreConfigured() {
  return process.env.AI_ROOM_HISTORY_MODE === "blob"
    && Boolean(process.env.BLOB_READ_WRITE_TOKEN)
    && Boolean(process.env.AI_ROOM_HISTORY_ACCESS_KEY);
}

export function historyRequestAuthorized(request: Request) {
  const expected = process.env.AI_ROOM_HISTORY_ACCESS_KEY;
  const actual = request.headers.get("x-ai-room-history-key");
  if (!expected || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function pathname(id: string) {
  return `${PREFIX}${encodeURIComponent(id)}.json`;
}

async function readJob(path: string): Promise<StoredAiRoomJob | null> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  try {
    const raw = await new Response(result.stream).json();
    return normalizeStoredJob(raw);
  } catch {
    return null;
  }
}

export async function listHistoryJobs(): Promise<StoredAiRoomJob[]> {
  if (!historyStoreConfigured()) return [];
  const found = await list({ prefix: PREFIX, limit: 100 });
  const jobs = await Promise.all(found.blobs.map(blob => readJob(blob.pathname)));
  return jobs
    .filter((job): job is StoredAiRoomJob => Boolean(job))
    .sort((a,b)=>Date.parse(b.createdAt||"")-Date.parse(a.createdAt||""))
    .slice(0,50);
}

export async function saveHistoryJob(job: StoredAiRoomJob): Promise<boolean> {
  if (!historyStoreConfigured()) return false;
  const normalized = normalizeStoredJob(job);
  if (!normalized) return false;
  await put(pathname(normalized.id), JSON.stringify(normalized), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return true;
}

export async function saveHistoryJobs(jobs: StoredAiRoomJob[]) {
  if (!historyStoreConfigured()) return 0;
  let saved = 0;
  for (const job of jobs.slice(0,50)) {
    if (await saveHistoryJob(job)) saved += 1;
  }
  return saved;
}

export async function updateHistoryJob(
  id: string,
  patch: Partial<Pick<StoredAiRoomJob,"status"|"videoUrl"|"error">>,
) {
  if (!historyStoreConfigured()) return false;
  const existing = await readJob(pathname(id));
  if (!existing) return false;
  const next = normalizeStoredJob({...existing,...patch});
  if (!next) return false;
  if (
    existing.status === next.status
    && existing.videoUrl === next.videoUrl
    && existing.error === next.error
  ) return true;
  return saveHistoryJob(next);
}

export async function deleteHistoryJob(id: string) {
  if (!historyStoreConfigured()) return false;
  await del(pathname(id));
  return true;
}
