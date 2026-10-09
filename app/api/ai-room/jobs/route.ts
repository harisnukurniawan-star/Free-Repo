import { NextResponse } from "next/server";
import {
  deleteHistoryJob,
  historyRequestAuthorized,
  historyStoreConfigured,
  listHistoryJobs,
  saveHistoryJobs,
} from "@/lib/ai-room-history-store";
import { normalizeStoredJob } from "@/lib/ai-room-jobs";

export const runtime = "nodejs";

function authState(request: Request) {
  if (!historyStoreConfigured()) {
    return { enabled: false, authorized: false };
  }
  return { enabled: true, authorized: historyRequestAuthorized(request) };
}

export async function GET(request: Request) {
  const state = authState(request);
  if (!state.enabled) {
    return NextResponse.json({ enabled: false, locked: false, jobs: [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!state.authorized) {
    return NextResponse.json({ enabled: true, locked: true, jobs: [] }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const jobs = await listHistoryJobs();
    return NextResponse.json({ enabled: true, locked: false, jobs }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ enabled: true, locked: false, error: "Server history is temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function PUT(request: Request) {
  const state = authState(request);
  if (!state.enabled) {
    return NextResponse.json({ error: "Server history is not configured." }, { status: 503 });
  }
  if (!state.authorized) {
    return NextResponse.json({ error: "History sync key is required." }, { status: 401 });
  }
  try {
    const body = await request.json() as { jobs?: unknown[] };
    const jobs = Array.isArray(body.jobs)
      ? body.jobs.map(normalizeStoredJob).filter((job): job is NonNullable<ReturnType<typeof normalizeStoredJob>> => Boolean(job))
      : [];
    const saved = await saveHistoryJobs(jobs);
    return NextResponse.json({ success: true, saved }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not save server history." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const state = authState(request);
  if (!state.enabled) {
    return NextResponse.json({ error: "Server history is not configured." }, { status: 503 });
  }
  if (!state.authorized) {
    return NextResponse.json({ error: "History sync key is required." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "Invalid history job ID." }, { status: 400 });
  }
  try {
    await deleteHistoryJob(id);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not delete server history." }, { status: 503 });
  }
}
