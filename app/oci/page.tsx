import DatabaseSidebar from "@/app/components/DatabaseSidebar";

const modules = [
  { name: "Compute & VM", detail: "Instance inventory, lifecycle state, shape and capacity", icon: "▣" },
  { name: "Database & HeatWave", detail: "DB systems, HeatWave clusters, backups and health", icon: "▤" },
  { name: "Bastion & Security", detail: "Bastion sessions, IAM posture and security controls", icon: "◇" },
  { name: "Functions", detail: "Applications, invocations, errors and latency", icon: "ƒ" },
  { name: "Object Storage", detail: "Buckets, objects, policies and storage health", icon: "▱" },
  { name: "Networking", detail: "VCN, subnets, gateways, routes and network security", icon: "⌘" },
  { name: "Health & Monitoring", detail: "Service health, alarms, metrics and incidents", icon: "⌁" },
  { name: "OCI Usage & Cost", detail: "Usage and cost visibility when billing access is configured", icon: "◷" },
];

export const dynamic = "force-dynamic";

export default function OciInfrastructurePage() {
  return (
    <main className="control-room oci-control-room">
      <DatabaseSidebar mode="oci" />
      <section className="workspace oci-workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">CONTROL ROOM / INFRASTRUCTURE</span>
            <h1>OCI Infrastructure</h1>
            <p>Centralized, read-only visibility for Oracle Cloud Infrastructure resources</p>
          </div>
          <div className="top-actions"><span className="oci-state-pill"><i /> BRIDGE NOT VERIFIED</span></div>
        </header>

        <section className="oci-connection panel">
          <div className="oci-connection-icon">⌁</div>
          <div className="oci-connection-copy">
            <span className="eyebrow">CONNECTIVITY STATUS</span>
            <h2>OCI data connection is not verified</h2>
            <p>The dashboard shell is ready. Live resource data will appear only after the OCI bridge endpoint, authentication and resource permissions pass an end-to-end check.</p>
          </div>
          <div className="oci-connection-status"><span className="status-dot" /> Not connected</div>
        </section>

        <div className="oci-section-heading">
          <div><span className="eyebrow">INFRASTRUCTURE DOMAINS</span><h2>Resource modules</h2></div>
          <span className="oci-readonly-tag">READ-ONLY FIRST</span>
        </div>
        <div className="oci-module-grid">
          {modules.map((item) => (
            <article className="oci-module-card" key={item.name}>
              <div className="oci-module-top"><span className="oci-module-icon">{item.icon}</span><span className="oci-module-state">Awaiting connection</span></div>
              <h3>{item.name}</h3>
              <p>{item.detail}</p>
              <div className="oci-module-foot"><span>Live telemetry unavailable</span><span aria-hidden="true">↗</span></div>
            </article>
          ))}
        </div>

        <section className="panel oci-architecture">
          <div className="panel-head"><div><span className="eyebrow">INTEGRATION PATH</span><h2>Monitoring architecture</h2></div><span className="oci-readonly-tag">NO MUTATING ACTIONS</span></div>
          <div className="oci-flow">
            <div><small>01 · APPLICATION</small><strong>AI Room Control Room</strong><span>OCI Infrastructure UI</span></div>
            <b>→</b>
            <div><small>02 · API LAYER</small><strong>Protected API</strong><span>Session + scope validation</span></div>
            <b>→</b>
            <div><small>03 · BRIDGE</small><strong>Railway MCP</strong><span>Endpoint / auth pending verification</span></div>
            <b>→</b>
            <div><small>04 · CLOUD</small><strong>OCI APIs</strong><span>Read-only resource queries</span></div>
          </div>
          <p className="oci-note">No live values are fabricated. Each module remains explicitly unavailable until its own OCI API call succeeds and returns a timestamped response.</p>
        </section>
      </section>
    </main>
  );
}
