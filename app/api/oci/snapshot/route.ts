import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER = "harisnukurniawan-star";
const REPO = "oci-vm-retry";
const ISSUE = 59;

function capture(body: string, pattern: RegExp, fallback = "NOT REPORTED") {
  return body.match(pattern)?.[1]?.trim() || fallback;
}

export async function GET() {
  const token = process.env.OCI_GITHUB_READ_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        status: "not_configured",
        source: `GitHub Issue #${ISSUE}`,
        message: "OCI_GITHUB_READ_TOKEN is not configured on the server.",
        readOnly: true,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE}/comments?per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "source_error",
          source: `GitHub Issue #${ISSUE}`,
          message: `GitHub returned HTTP ${response.status}`,
          readOnly: true,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const comments = (await response.json()) as Array<{
      body?: string;
      created_at?: string;
      html_url?: string;
    }>;

    const report = comments
      .filter((item) => item.body?.includes("OCI REMOTE: overview"))
      .sort(
        (a, b) =>
          Date.parse(b.created_at || "") - Date.parse(a.created_at || ""),
      )[0];

    if (!report?.body) {
      return NextResponse.json(
        {
          status: "no_report",
          source: `GitHub Issue #${ISSUE}`,
          message: "No OCI REMOTE overview report found.",
          readOnly: true,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = report.body;
    const buckets = [...body.matchAll(/- (ai-room-[^:]+):\s*(.+)$/gm)].map(
      (match) => ({ name: match[1], state: match[2].trim() }),
    );

    return NextResponse.json(
      {
        status: "reported",
        readOnly: true,
        source: `GitHub Issue #${ISSUE}`,
        reportUrl:
          report.html_url ||
          `https://github.com/${OWNER}/${REPO}/issues/${ISSUE}`,
        observedAt: capture(body, /^UTC:\s*(.+)$/m, report.created_at || "UNKNOWN"),
        region: capture(body, /^Region:\s*(.+)$/m, "UNKNOWN"),
        coverage: {
          compartmentsChecked: capture(
            body,
            /Accessible compartment scopes checked:\s*(.+)$/m,
          ),
          fullyListed: capture(body, /Scopes fully listed:\s*(.+)$/m),
          note: "Coverage is limited to compartments accessible to the OCI principal.",
        },
        compute: {
          discovery: capture(
            body,
            /Controller VM discovery:\s*(.+)$/m,
          ),
          recordsExamined: capture(
            body,
            /Compute records examined:\s*(.+)$/m,
          ),
        },
        network: {
          vcn: capture(body, /Controller VCN:\s*(.+)$/m),
          subnet: capture(body, /Controller subnet:\s*(.+)$/m),
          sshIngress: capture(
            body,
            /SSH ingress exposure:\s*(.+)$/m,
          ),
        },
        functions: {
          application: capture(body, /Application:\s*(.+)$/m),
          active: capture(body, /Functions ACTIVE:\s*(.+)$/m),
          note: "Lifecycle metadata only; not endpoint availability.",
        },
        storage: {
          buckets,
          note: "Bucket metadata only; lifecycle is not established.",
        },
        health: "NOT ESTABLISHED",
        limitations: [
          "Read-only metadata report; not continuous telemetry.",
          "Compute coverage is limited to accessible compartments.",
          "NSGs were not inspected.",
          "Function ACTIVE is lifecycle metadata, not endpoint health.",
          "Bucket contents were not read; lifecycle is UNKNOWN.",
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "source_error",
        source: `GitHub Issue #${ISSUE}`,
        message: "Unable to retrieve the OCI report from GitHub.",
        readOnly: true,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
