import "server-only";

/** Historical OCI metadata from the private controller repository; never a live-health probe. */
const REPO = "harisnukurniawan-star/oci-vm-retry";
const OWNER = "harisnukurniawan-star";
const REPORTER = "github-actions[bot]";
const TITLES = new Set(["OCI REMOTE: compute", "OCI REMOTE: overview"]);
const REPO_URL = "https://github.com/" + REPO;

export type OciControllerEvidence = {
  source: "snapshot" | "unavailable";
  checkedAt: string;
  fetchedAt: string;
  issueUrl: string;
  discovery: "not_found" | "found" | "ambiguous" | "partial" | "unverified";
  coverage: "complete_accessible" | "partial";
  scopesChecked: number | null;
  scopesComplete: number | null;
  recordsChecked: number | null;
  apply: "disabled" | "unverified";
};

type RecordObject = Record<string, unknown>;
const object = (value: unknown): RecordObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordObject : {};
const string = (value: unknown): string => typeof value === "string" ? value : "";
const allowedState: Record<string, OciControllerEvidence["discovery"]> = {
  NOT_FOUND_IN_ENUMERATED_ACCESSIBLE_SCOPES: "not_found",
  NOT_FOUND_WITH_INCOMPLETE_VISIBILITY: "partial",
  FOUND_ONE_VISIBLE_MATCH_NOT_APPLY_AUTHORIZED: "found",
  AMBIGUOUS_MULTIPLE_VISIBLE_MATCHES: "ambiguous",
};

function line(body: string, key: string): string {
  const prefix = "- " + key + ": ";
  const found = body.split("\n").find(row => row.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}
function count(raw: string, max: number): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= max ? value : null;
}

export function unavailableOciController(): OciControllerEvidence {
  return {
    source: "unavailable", checkedAt: "", fetchedAt: new Date().toISOString(),
    issueUrl: "", discovery: "unverified", coverage: "partial",
    scopesChecked: null, scopesComplete: null, recordsChecked: null, apply: "unverified",
  };
}

/** Parse fixed bot-issued report fields; never relay raw comment/OCIDs/secrets to browser. */
export function parseOciComputeReport(
  title: string, issueNumber: number, body: string, createdAt: string,
): OciControllerEvidence | null {
  if (!TITLES.has(title) || !Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
      !body.startsWith("## OCI remote management: " + title + "\n") ||
      !Number.isFinite(Date.parse(createdAt))) return null;
  const status = line(body, "Controller VM discovery");
  const discovery = allowedState[status];
  if (!discovery) return null;
  const scopesChecked = count(line(body, "Accessible compartment scopes checked"), 50);
  const scopesComplete = count(line(body, "Scopes fully listed"), 50);
  const recordsChecked = count(line(body, "Compute records examined"), 10000);
  if (scopesChecked === null || scopesChecked < 1 ||
      scopesComplete === null || scopesComplete > scopesChecked ||
      recordsChecked === null) return null;
  const coverageText = line(body, "Coverage");
  const coverage = coverageText ===
    "COMPLETE only within compartments accessible to this OCI principal" &&
    scopesChecked === scopesComplete ? "complete_accessible" : "partial";
  const effectiveDiscovery = discovery === "not_found" && coverage !== "complete_accessible"
    ? "partial" : discovery;
  const apply = line(body, "OCI APPLY") ===
    "DISABLED; fingerprints never authorize instance actions" ? "disabled" : "unverified";
  return {
    source: "snapshot", checkedAt: new Date(createdAt).toISOString(),
    fetchedAt: new Date().toISOString(), issueUrl: REPO_URL + "/issues/" + issueNumber,
    discovery: effectiveDiscovery, coverage, scopesChecked, scopesComplete, recordsChecked, apply,
  };
}

async function githubJson(path: string, token: string): Promise<unknown> {
  const response = await fetch("https://api.github.com/repos/" + REPO + path, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": "Control-Room-OCI-Snapshot-Read-Only",
    },
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error("github-unavailable");
  return response.json();
}

/**
 * A dedicated fine-grained Issues:read token is required at server runtime.
 * No OCI API calls, Function invocations, or permission to mutate resources.
 */
export async function loadOciControllerEvidence(): Promise<OciControllerEvidence> {
  const token = process.env.OCI_CONTROLLER_GITHUB_TOKEN;
  if (!token) return unavailableOciController();
  try {
    const result = await githubJson("/issues?state=all&sort=created&direction=desc&per_page=100", token);
    if (!Array.isArray(result)) return unavailableOciController();
    const issues = result.map(object).filter(issue =>
      TITLES.has(string(issue.title)) &&
      string(object(issue.user).login) === OWNER &&
      !issue.pull_request).slice(0, 10);
    for (const issue of issues) {
      const number = Number(issue.number);
      if (!Number.isSafeInteger(number) || number <= 0) continue;
      const comments = await githubJson("/issues/" + number + "/comments?per_page=100", token);
      if (!Array.isArray(comments)) continue;
      for (const raw of comments.slice().reverse()) {
        const comment = object(raw);
        if (string(object(comment.user).login) !== REPORTER) continue;
        const parsed = parseOciComputeReport(
          string(issue.title), number, string(comment.body), string(comment.created_at),
        );
        if (parsed) return parsed;
      }
    }
  } catch {
    // Missing permissions, rate limits, and network problems must not appear healthy.
  }
  return unavailableOciController();
}
