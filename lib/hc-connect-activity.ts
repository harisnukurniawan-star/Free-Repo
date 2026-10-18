import "server-only";

export type HcSource = "live" | "unavailable";
export type HcRun = { id: number; name: string; branch: string; state: string; conclusion: string; at: string; url: string };
export type HcPr = { number: number; title: string; draft: boolean; updatedAt: string; url: string };
export type HcCommit = { sha: string; title: string; at: string; url: string };
export type HcSignal = { id: string; category: "error" | "issue" | "backlog"; title: string; detail: string; at: string; url: string };
export type HcActivity = {
  checkedAt: string;
  website: { code: number | null; state: "online" | "error" | "unavailable"; checkedAt: string };
  github: { prsSource: HcSource; runsSource: HcSource; issuesSource: HcSource; commitsSource: HcSource; prs: HcPr[]; runs: HcRun[]; issuesCount: number; commits: HcCommit[] };
  vercel: { source: HcSource; production: { state: string; at: string; url: string } | null; failedPreviews: number };
  signals: HcSignal[];
};
const repo = "jakgunn20-maker/hcbp-hub";
const githubApi = "https://api.github.com/repos/" + repo;
const githubHtml = "https://github.com/" + repo + "/";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown): string => typeof v === "string" ? v : "";
const safeUrl = (url: unknown) => str(url).startsWith(githubHtml) ? str(url) : "https://github.com/" + repo;
const stamp = () => new Date().toISOString();
async function request(url: string, token?: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Control-Room-HC-ReadOnly", ...(token ? { Authorization: "Bearer " + token } : {}) },
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error("upstream-" + response.status);
  return response.json();
}
async function pullRequests() {
  try {
    const raw = await request(githubApi + "/pulls?state=open&per_page=60", process.env.HC_CONNECT_GITHUB_TOKEN);
    if (!Array.isArray(raw)) throw new Error("invalid-pr");
    return { source: "live" as const, rows: raw.map((v): HcPr => {
      const p = obj(v);
      return { number: Number(p.number), title: str(p.title).slice(0,170), draft: p.draft === true,
        updatedAt: str(p.updated_at), url: safeUrl(p.html_url) };
    }).filter(p => Number.isSafeInteger(p.number) && p.number > 0 && p.url.endsWith("/pull/" + p.number)) };
  } catch { return { source: "unavailable" as const, rows: [] as HcPr[] }; }
}
async function workflows() {
  try {
    const raw = obj(await request(githubApi + "/actions/runs?per_page=45", process.env.HC_CONNECT_GITHUB_TOKEN));
    if (!Array.isArray(raw.workflow_runs)) throw new Error("invalid-workflows");
    return { source: "live" as const, rows: raw.workflow_runs.map((v): HcRun => {
      const r = obj(v);
      return { id: Number(r.id), name: str(r.name).slice(0,130), branch: str(r.head_branch).slice(0,110),
        state: str(r.status), conclusion: str(r.conclusion), at: str(r.created_at), url: safeUrl(r.html_url) };
    }).filter(r => Number.isSafeInteger(r.id) && r.id > 0 && r.at) };
  } catch { return { source: "unavailable" as const, rows: [] as HcRun[] }; }
}
async function issues() {
  try {
    const raw = await request(githubApi + "/issues?state=open&per_page=60&sort=updated&direction=desc", process.env.HC_CONNECT_GITHUB_TOKEN);
    if (!Array.isArray(raw)) throw new Error("invalid-issues");
    const rows = raw.map(obj).filter(issue => !issue.pull_request);
    return { source: "live" as const, count: rows.length, rows: rows.map((issue): HcSignal => ({
      id: "issue-" + Number(issue.number), category: "issue", title: "#" + Number(issue.number) + " · " + str(issue.title).slice(0,150),
      detail: "Isu GitHub belum ditutup · perlu triase operasional", at: str(issue.updated_at), url: safeUrl(issue.html_url),
    })) };
  } catch { return { source: "unavailable" as const, count: 0, rows: [] as HcSignal[] }; }
}
async function commits() {
  try {
    const raw = await request(githubApi + "/commits?per_page=7", process.env.HC_CONNECT_GITHUB_TOKEN);
    if (!Array.isArray(raw)) throw new Error("invalid-commits");
    return { source: "live" as const, rows: raw.map((v): HcCommit => {
      const c = obj(v); const detail = obj(c.commit); const author = obj(detail.committer);
      return { sha: str(c.sha).slice(0,8), title: str(detail.message).split("\n")[0].slice(0,160),
        at: str(author.date), url: safeUrl(c.html_url) };
    }).filter(c => c.sha && c.at) };
  } catch { return { source: "unavailable" as const, rows: [] as HcCommit[] }; }
}
async function website(): Promise<HcActivity["website"]> {
  const checkedAt = stamp();
  try {
    const response = await fetch("https://hcconnect.site/", { method: "GET", cache: "no-store", redirect: "manual",
      headers: { "User-Agent": "Control-Room-HC-Healthcheck" }, signal: AbortSignal.timeout(6500) });
    await response.body?.cancel().catch(() => undefined);
    return { code: response.status, state: response.status >= 200 && response.status < 400 ? "online" : "error", checkedAt };
  } catch { return { code: null, state: "unavailable", checkedAt }; }
}
async function vercel(): Promise<HcActivity["vercel"]> {
  // Runtime logs are NOT available through this deployment endpoint.
  const token = process.env.HC_CONNECT_VERCEL_TOKEN;
  if (!token) return { source: "unavailable", production: null, failedPreviews: 0 };
  try {
    const data = obj(await request("https://api.vercel.com/v6/deployments?projectId=prj_cgxq8S8ekJBf5rK2A2FJANk5Fo4z&teamId=team_IpbRPzH8oOfqStbGKjc27qJJ&limit=30", token));
    if (!Array.isArray(data.deployments)) throw new Error("invalid-vercel");
    const deployments = data.deployments.map(obj);
    const production = deployments.find(d => d.target === "production");
    const failureCount = deployments.filter(d => d.target !== "production" && d.state === "ERROR").length;
    return { source: "live", production: production ? { state: str(production.state) || "UNKNOWN",
      at: typeof production.created === "number" ? new Date(production.created).toISOString() : "",
      url: str(production.inspectorUrl) } : null, failedPreviews: failureCount };
  } catch { return { source: "unavailable", production: null, failedPreviews: 0 }; }
}
export async function loadHcActivity(): Promise<HcActivity> {
  const [prs, runs, ghIssues, changes, web, vercelResult] = await Promise.all([
    pullRequests(), workflows(), issues(), commits(), website(), vercel(),
  ]);
  const cutoff = Date.now() - 72 * 3600 * 1000;
  const brokenRuns: HcSignal[] = runs.rows.filter(run => ["failure", "timed_out"].includes(run.conclusion) && Date.parse(run.at) >= cutoff).slice(0, 14).map(run => ({
    id: "run-" + run.id, category: "error",
    title: "Workflow gagal: " + run.name,
    detail: run.branch + " · " + run.conclusion + " · CI/monitor historis; belum tentu gangguan produksi",
    at: run.at, url: run.url,
  }));
  const backlog: HcSignal[] = prs.rows.filter(p => /fix|bug|diagnos|gateway|cutover|tls|validat|relay/i.test(p.title)).slice(0, 12).map(p => ({
    id: "pr-" + p.number, category: "backlog", title: "#" + p.number + " · " + p.title,
    detail: (p.draft ? "Draft PR" : "Open PR") + " · belum merged; bukan bukti bug produksi aktif",
    at: p.updatedAt, url: p.url,
  }));
  const failedPreview: HcSignal[] = vercelResult.source === "live" && vercelResult.failedPreviews > 0
    ? [{ id: "preview-failed", category: "error", title: vercelResult.failedPreviews + " preview deployment gagal",
      detail: "Dari 30 deployment Vercel terakhir; bukan otomatis error produksi", at: stamp(),
      url: "https://vercel.com/jakgunn20-4556s-projects/hc-connect" }] : [];
  const webAlert: HcSignal[] = web.state === "error" ? [{ id: "site-http", category: "error",
    title: "Endpoint HC Connect mengembalikan HTTP " + web.code,
    detail: "Pemeriksaan URL publik saja, perlu investigasi akar penyebab",
    at: web.checkedAt, url: "https://hcconnect.site/" }] : [];
  return { checkedAt: stamp(), website: web,
    github: { prsSource: prs.source, runsSource: runs.source, issuesSource: ghIssues.source, commitsSource: changes.source,
      prs: prs.rows, runs: runs.rows, issuesCount: ghIssues.count, commits: changes.rows },
    vercel: vercelResult,
    signals: [...webAlert, ...brokenRuns, ...ghIssues.rows, ...backlog, ...failedPreview].sort((a,b) => Date.parse(b.at) - Date.parse(a.at)),
  };
}
