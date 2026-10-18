import "server-only";

export type ActivitySource = "live" | "unavailable";
export type ActivitySignal = {
  id: string;
  kind: "ci" | "issue";
  title: string;
  detail: string;
  url: string;
  at: string;
  scope: "development";
};
export type ActivityRun = {
  id: number;
  name: string;
  branch: string;
  status: string;
  conclusion: string;
  url: string;
  at: string;
};
export type ActivityWebsite = {
  state: "reachable" | "error" | "unavailable";
  httpCode: number | null;
  checkedAt: string;
};
export type HasnariaActivity = {
  checkedAt: string;
  actionsSource: ActivitySource;
  issuesSource: ActivitySource;
  runs: ActivityRun[];
  issueCount: number;
  signals: ActivitySignal[];
  website: ActivityWebsite;
};

const repo = "ekariashoesanti-alt/Hasnaria-ice-cream";
const root = `https://api.github.com/repos/${repo}`;
const acceptedUrl = `https://github.com/${repo}/`;

type Dict = Record<string, unknown>;
function obj(value: unknown): Dict {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Dict : {};
}
const string = (value: unknown): string => typeof value === "string" ? value : "";
const safeUrl = (value: unknown): string => {
  const url = string(value);
  return url.startsWith(acceptedUrl) ? url : `https://github.com/${repo}`;
};
async function github(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Control-Room-Hasnaria-Observability",
      ...(process.env.HASNARIA_GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.HASNARIA_GITHUB_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`github-${response.status}`);
  return response.json();
}
async function actions(): Promise<{ source: ActivitySource; runs: ActivityRun[]; signals: ActivitySignal[] }> {
  try {
    const raw = obj(await github(`${root}/actions/runs?per_page=35`));
    if (!Array.isArray(raw.workflow_runs)) throw new Error("invalid-actions-payload");
    const runs = raw.workflow_runs.map(item => {
      const r = obj(item);
      return {
        id: Number(r.id), name: string(r.name).slice(0, 110), branch: string(r.head_branch).slice(0, 110),
        status: string(r.status), conclusion: string(r.conclusion), url: safeUrl(r.html_url),
        at: string(r.created_at),
      };
    }).filter(run => Number.isSafeInteger(run.id) && run.id > 0 && run.at);
    const cutoff = Date.now() - 72 * 3600 * 1000;
    const signals = runs.filter(r => ["failure", "timed_out", "cancelled"].includes(r.conclusion) &&
      r.conclusion !== "cancelled" && Date.parse(r.at) >= cutoff).slice(0, 10).map(r => ({
      id: `run-${r.id}`, kind: "ci" as const, title: `CI gagal: ${r.name}`,
      detail: `Branch ${r.branch || "tidak diketahui"} · ${r.conclusion}; pemeriksaan build/test, bukan bukti error runtime produksi.`,
      url: r.url, at: r.at, scope: "development" as const,
    }));
    return { source: "live", runs, signals };
  } catch { return { source: "unavailable", runs: [], signals: [] }; }
}
async function issues(): Promise<{ source: ActivitySource; count: number; signals: ActivitySignal[] }> {
  try {
    const raw = await github(`${root}/issues?state=open&per_page=60&sort=updated&direction=desc`);
    if (!Array.isArray(raw)) throw new Error("invalid-issues-payload");
    const rows = raw.map(obj).filter(item => !item.pull_request);
    const signals = rows.slice(0, 12).map(issue => ({
      id: `issue-${Number(issue.number)}`, kind: "issue" as const,
      title: `Isu #${Number(issue.number)}: ${string(issue.title).slice(0, 140)}`,
      detail: "Isu GitHub masih terbuka · perlu triase dampak dan prioritas.",
      url: safeUrl(issue.html_url), at: string(issue.updated_at), scope: "development" as const,
    }));
    return { source: "live", count: rows.length, signals };
  } catch { return { source: "unavailable", count: 0, signals: [] }; }
}
async function website(): Promise<ActivityWebsite> {
  const checkedAt = new Date().toISOString();
  try {
    // A successful HTTP response is only an endpoint check, NOT evidence that ERP transactions work.
    const response = await fetch("https://hasnaria-business-analyzer.vercel.app/", {
      method: "GET", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(6500),
      headers: { "User-Agent": "Control-Room-Hasnaria-ReadOnly-Probe" },
    });
    await response.body?.cancel().catch(() => undefined);
    return { state: response.status >= 200 && response.status < 400 ? "reachable" : "error",
      httpCode: response.status, checkedAt };
  } catch { return { state: "unavailable", httpCode: null, checkedAt }; }
}
export async function loadHasnariaActivity(): Promise<HasnariaActivity> {
  const [ci, ghIssues, web] = await Promise.all([actions(), issues(), website()]);
  return {
    checkedAt: new Date().toISOString(),
    actionsSource: ci.source, issuesSource: ghIssues.source,
    runs: ci.runs, issueCount: ghIssues.count,
    signals: [...ci.signals, ...ghIssues.signals].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    website: web,
  };
}
