import "server-only";

export type Source = "live" | "snapshot" | "unavailable";
export type Status = { value: string; source: Source; checkedAt: string; detail?: string };
export type PullRequest = { number: number; title: string; url: string; updatedAt: string; state: "open" | "merged" };
export type HasnariaData = {
  checkedAt: string;
  githubSource: Source;
  openPrs: PullRequest[];
  githubNote: string;
  vercel: Status;
  production: Status;
  staging: Status;
};

const repo = "ekariashoesanti-alt/Hasnaria-ice-cream";
const verifiedAt = "2026-10-18T03:25:22.733Z";
const snapshot = (value: string, detail?: string): Status => ({ value, source: "snapshot", checkedAt: verifiedAt, detail });
const fallbackPrs: PullRequest[] = [
  { number: 88, title: "Protect canonical Purchase–Stock lineage before re-import", url: "https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/88", state: "open", updatedAt: "2026-10-13T17:55:30Z" },
  { number: 83, title: "Reduce Administration reloads and unblock Finance rendering", url: "https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/83", state: "open", updatedAt: "2026-10-13T14:18:09Z" },
];
async function getJson(url: string, bearer?: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Control-Room-Hasnaria-ReadOnly", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`upstream-${response.status}`);
  return response.json();
}
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const str = (value: unknown) => typeof value === "string" ? value : "";
async function githubPrs(): Promise<{ source: Source; prs: PullRequest[]; note: string }> {
  try {
    const raw = await getJson(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=40`, process.env.HASNARIA_GITHUB_TOKEN);
    if (!Array.isArray(raw)) throw new Error("unexpected-github-response");
    const prs = raw.map((item) => {
      const row = record(item);
      return { number: Number(row.number), title: str(row.title).slice(0, 200),
        url: str(row.html_url), updatedAt: str(row.updated_at), state: "open" as const };
    }).filter((pr) => Number.isSafeInteger(pr.number) && pr.number > 0 && pr.url.startsWith(`https://github.com/${repo}/pull/`));
    return { source: "live", prs, note: "GitHub API · read-only" };
  } catch {
    return { source: "snapshot", prs: fallbackPrs, note: "GitHub belum dapat diperbarui; menampilkan snapshot 18 Oktober 2026" };
  }
}
async function vercelStatus(): Promise<Status> {
  const token = process.env.HASNARIA_VERCEL_TOKEN;
  if (!token) return snapshot("READY", "Deployment d8e88db2 · data terakhir diverifikasi 18 Okt 2026");
  try {
    const raw = record(await getJson("https://api.vercel.com/v6/deployments?projectId=prj_3hffxx6Ll0BaqKKGlPEPWRsOwa9d&teamId=team_Yqq3loNUJgMxQ6SKhCuzpMSm&limit=20", token));
    const deployments = Array.isArray(raw.deployments) ? raw.deployments : [];
    const deploy = deployments.map(record).find((item) => item.target === "production");
    if (!deploy) return { value: "Belum tersedia", source: "unavailable", checkedAt: new Date().toISOString() };
    return { value: str(deploy.readyState || deploy.state) || "UNKNOWN", source: "live", checkedAt: new Date().toISOString(),
      detail: `Commit ${str(record(deploy.meta).githubCommitSha).slice(0, 8) || "—"}` };
  } catch { return snapshot("READY", "Vercel API gagal; hanya snapshot 18 Okt 2026"); }
}
async function supabaseStatus(id: string, fallbackRegion: string): Promise<Status> {
  const token = process.env.HASNARIA_SUPABASE_MANAGEMENT_TOKEN;
  if (!token) return snapshot("ACTIVE_HEALTHY", fallbackRegion + " · snapshot 18 Okt 2026");
  try {
    const data = record(await getJson(`https://api.supabase.com/v1/projects/${id}`, token));
    return { value: str(data.status) || "UNKNOWN", source: "live", checkedAt: new Date().toISOString(), detail: str(data.region) || fallbackRegion };
  } catch { return snapshot("ACTIVE_HEALTHY", fallbackRegion + " · API tidak tersedia; snapshot 18 Okt 2026"); }
}
export async function loadHasnariaData(): Promise<HasnariaData> {
  const [github, vercel, production, staging] = await Promise.all([
    githubPrs(), vercelStatus(), supabaseStatus("bnnhmtkpdjlgehsvgoda", "Tokyo"),
    supabaseStatus("rynnpndtzjwpekbiwiif", "Singapore"),
  ]);
  return { checkedAt: new Date().toISOString(), githubSource: github.source, openPrs: github.prs, githubNote: github.note, vercel, production, staging };
}
