import DatabaseSidebar from "@/app/components/DatabaseSidebar";
import "./oci.css";

export const dynamic = "force-dynamic";

type ReportLink = {
  label: string;
  href: string;
};

type ModuleInfo = {
  id: string;
  title: string;
  icon: string;
  state: string;
  tone: "partial" | "stale" | "unavailable" | "metadata";
  summary: string;
  detail: string;
  reports: ReportLink[];
};

const remoteReport: ReportLink = {
  label: "OCI REMOTE: overview · Issue #59",
  href: "https://github.com/harisnukurniawan-star/oci-vm-retry/issues/59",
};

const diagnosticReport: ReportLink = {
  label: "OCI DIAG: overview · Issue #60",
  href: "https://github.com/harisnukurniawan-star/oci-vm-retry/issues/60",
};

const modules: ModuleInfo[] = [
  {
    id: "compute",
    title: "Compute / VM",
    icon: "▣",
    state: "Partial report",
    tone: "partial",
    summary: "No controller VM was found in the two accessible compartment scopes.",
    detail: "The report examined zero compute records. Coverage is complete only within the scopes visible to the OCI identity; it does not establish that the tenancy has no VMs.",
    reports: [remoteReport],
  },
  {
    id: "database",
    title: "Database / HeatWave",
    icon: "▤",
    state: "Stale snapshot",
    tone: "stale",
    summary: "No current database inventory or health reading is connected to this module.",
    detail: "The existing HeatWave view in the application is a snapshot captured on 28 September 2026. It is not refreshed by the current OCI controller and is not live infrastructure telemetry.",
    reports: [],
  },
  {
    id: "bastion",
    title: "Bastion / Security",
    icon: "◇",
    state: "No live report",
    tone: "unavailable",
    summary: "No current Bastion session count or IAM posture is verified.",
    detail: "The Railway OCI MCP gateway declares a read-only Bastion session tool, but the gateway is sleeping and has returned no live session data. The GitHub overview checks selected network security lists, not Bastion sessions or IAM posture.",
    reports: [remoteReport],
  },
  {
    id: "functions",
    title: "Functions",
    icon: "ƒ",
    state: "Metadata only",
    tone: "metadata",
    summary: "The HC Connect Function application and all three listed Functions were ACTIVE in the latest report.",
    detail: "ACTIVE is lifecycle metadata, not endpoint availability. Invocation, error, and duration metrics were reported as NO DATA for the previous 24 hours; NO DATA is not zero and is not proof of health.",
    reports: [remoteReport, diagnosticReport],
  },
  {
    id: "storage",
    title: "Object Storage",
    icon: "▱",
    state: "Private metadata",
    tone: "metadata",
    summary: "Both known AI ROOM buckets reported NoPublicAccess; object contents were not read.",
    detail: "The latest diagnostics include bucket counts and stored-byte gauges. Lifecycle status remains UNKNOWN. The report inspected bucket metadata and did not download videos or other objects.",
    reports: [remoteReport, diagnosticReport],
  },
  {
    id: "networking",
    title: "Networking",
    icon: "⌘",
    state: "Partial report",
    tone: "partial",
    summary: "The controller VCN and subnet were AVAILABLE in the latest report.",
    detail: "Subnet metadata said public IP assignment was not prohibited. No broad SSH rule was found in the inspected security lists, but NSGs and guest firewalls were not inspected.",
    reports: [remoteReport],
  },
  {
    id: "monitoring",
    title: "Health / Monitoring",
    icon: "⌁",
    state: "Incomplete telemetry",
    tone: "partial",
    summary: "Application health is not established; Function metrics returned NO DATA and log search returned HTTP 404.",
    detail: "The controller reports missing samples separately from zero. The cause of the log-search 404 is unverified, and no service logging was enabled or changed.",
    reports: [diagnosticReport],
  },
  {
    id: "cost",
    title: "OCI Usage and Cost",
    icon: "◷",
    state: "Not available",
    tone: "unavailable",
    summary: "No OCI billing endpoint or billing permission has been verified.",
    detail: "No OCI cost figures are estimated or displayed. This module is separate from AI ROOM fal.ai generation-cost estimates.",
    reports: [],
  },
];

function EvidenceLinks({ reports }: { reports: ReportLink[] }) {
  if (reports.length === 0) {
    return <p className="oci-no-evidence">No current report covers this module.</p>;
  }

  return (
    <ul className="oci-evidence-links">
      {reports.map((report) => (
        <li key={report.href}>
          <a href={report.href} target="_blank" rel="noreferrer">
            {report.label}
            <span aria-hidden="true"> ↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function OciInfrastructurePage() {
  return (
    <main className="control-room oci-control-room">
      <DatabaseSidebar mode="oci" />
      <section className="workspace oci-workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">CONTROL ROOM / INFRASTRUCTURE</span>
            <h1>OCI Infrastructure</h1>
            <p>Read-only infrastructure evidence with its current coverage and limits</p>
          </div>
          <div className="top-actions">
            <span className="oci-state-pill"><i aria-hidden="true" /> READ-ONLY AUDIT</span>
          </div>
        </header>

        <section className="oci-connection panel" aria-labelledby="oci-connection-title">
          <div className="oci-connection-icon" aria-hidden="true">⌁</div>
          <div className="oci-connection-copy">
            <span className="eyebrow">DASHBOARD DATA FEED</span>
            <h2 id="oci-connection-title">No live OCI feed is connected to this page</h2>
            <p>The verified GitHub controller returns read-only reports. Its results are not streamed into this dashboard. Historical findings below remain labeled with their source and coverage.</p>
          </div>
          <div className="oci-connection-status">
            <span className="oci-status-indicator" aria-hidden="true" />
            Report links only
          </div>
        </section>

        <section className="oci-bridge-section" aria-labelledby="oci-bridge-title">
          <div className="oci-section-heading">
            <div>
              <span className="eyebrow">SEPARATE CONNECTION PATHS</span>
              <h2 id="oci-bridge-title">Bridge status</h2>
            </div>
            <span className="oci-readonly-tag">NO OCI MUTATIONS</span>
          </div>

          <div className="oci-bridge-grid">
            <article className="oci-bridge-card oci-bridge-card--verified">
              <div className="oci-bridge-heading">
                <h3>GitHub OCI Controller</h3>
                <span className="oci-bridge-state">Reports completed</span>
              </div>
              <p>Owner-created, exact-title GitHub Issues run fixed read-only OCI checks through Actions and return report comments.</p>
              <p className="oci-observed">Latest evidence: 21 Nov 2026, 23:25 and 23:30 UTC.</p>
              <EvidenceLinks reports={[remoteReport, diagnosticReport]} />
              <small>This is an external report path, not a live dashboard feed. OCI write mode is disabled.</small>
            </article>

            <article className="oci-bridge-card oci-bridge-card--sleeping">
              <div className="oci-bridge-heading">
                <h3>Railway OCI MCP Gateway</h3>
                <span className="oci-bridge-state">Sleeping</span>
              </div>
              <p>Railway reports the OCI MCP service as SLEEPING. Its source declares read-only tools for Compute, Bastion sessions, Functions, and Storage.</p>
              <p>The gateway expects a protected read scope and forwards requests through an HC bridge URL. The destination and end-to-end response are not verified.</p>
              <small>This page does not call the gateway or wake the sleeping service.</small>
            </article>

            <article className="oci-bridge-card oci-bridge-card--separate">
              <div className="oci-bridge-heading">
                <h3>HC Connect Bastion API</h3>
                <span className="oci-bridge-state">Online</span>
              </div>
              <p>This is a separate HC Connect backend service. Railway reported it online during this audit; that does not prove it is the OCI MCP gateway's configured destination or establish OCI application health.</p>
              <small>HC Connect and OCI Infrastructure remain separate modules in the Control Room.</small>
            </article>
          </div>
        </section>

        <section className="oci-modules-section" aria-labelledby="oci-modules-title">
          <div className="oci-section-heading">
            <div>
              <span className="eyebrow">INFRASTRUCTURE DOMAINS</span>
              <h2 id="oci-modules-title">Resource modules</h2>
            </div>
            <span className="oci-readonly-tag">AUDIT SNAPSHOT · 22 NOV 2026</span>
          </div>

          <nav className="oci-module-index" aria-label="OCI infrastructure modules">
            {modules.map((item) => (
              <a key={item.id} href={"#" + item.id}>{item.title}</a>
            ))}
          </nav>

          <div className="oci-module-grid">
            {modules.map((item) => (
              <article
                className={"oci-module-card oci-module-card--" + item.tone}
                id={item.id}
                key={item.id}
                aria-labelledby={item.id + "-title"}
              >
                <div className="oci-module-top">
                  <span className="oci-module-icon" aria-hidden="true">{item.icon}</span>
                  <span className={"oci-module-state oci-module-state--" + item.tone}>{item.state}</span>
                </div>
                <h3 id={item.id + "-title"}>{item.title}</h3>
                <p className="oci-module-summary">{item.summary}</p>
                <details className="oci-module-detail">
                  <summary>Coverage and limits</summary>
                  <p>{item.detail}</p>
                </details>
                <EvidenceLinks reports={item.reports} />
              </article>
            ))}
          </div>
        </section>

        <section className="panel oci-architecture" aria-labelledby="oci-architecture-title">
          <div className="panel-head">
            <div>
              <span className="eyebrow">VERIFIED REPORT PATH</span>
              <h2 id="oci-architecture-title">GitHub Issue → Actions → OCI read-only APIs → report comment</h2>
            </div>
            <span className="oci-readonly-tag">NO WRITE ACTIONS</span>
          </div>
          <p className="oci-note">The dashboard does not call the Railway OCI MCP Gateway or use HC Connect credentials. The private GitHub reports are historical observations; a completed check does not mean the OCI service is healthy.</p>
        </section>
      </section>
    </main>
  );
}
