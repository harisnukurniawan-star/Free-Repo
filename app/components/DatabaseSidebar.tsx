"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  mode: "hc" | "hasnaria";
  ociConnected?: boolean;
  ociSnapshot?: boolean;
};

export default function DatabaseSidebar({ mode, ociConnected = false, ociSnapshot = false }: Props) {
  const [expanded, setExpanded] = useState(true);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div><strong>CONTROL ROOM</strong><span>Operations Console</span></div>
      </div>
      <nav aria-label="Control Room navigation">
        <button
          type="button"
          className="nav-item database-parent active"
          aria-expanded={expanded}
          aria-controls="database-subnav"
          onClick={() => setExpanded((current) => !current)}
        ><span aria-hidden="true">▦</span> Database <span className="nav-caret" aria-hidden="true">{expanded ? "⌄" : "›"}</span></button>
        {expanded && (
          <div id="database-subnav" className="database-subnav">
            <Link href="/database/hc-connect" className={`nav-item subnav-link ${mode === "hc" ? "active" : ""}`} aria-current={mode === "hc" ? "page" : undefined}>
              <span aria-hidden="true">▤</span> HC Connect
            </Link>
            <Link href="/database/hasnaria-terrace" className={`nav-item subnav-link ${mode === "hasnaria" ? "active" : ""}`} aria-current={mode === "hasnaria" ? "page" : undefined}>
              <span aria-hidden="true">◈</span> Hasnaria Terrace
            </Link>
          </div>
        )}
        <Link href="/ai-room" className="nav-item"><span aria-hidden="true">✦</span> AI ROOM</Link>
        <button type="button" className="nav-item disabled" disabled><span aria-hidden="true">◌</span> Usage & Cost <small>Soon</small></button>
      </nav>
      <div className="side-foot">
        <span className={`status-dot ${mode === "hc" ? (ociConnected ? "online" : "offline") : "neutral"}`} />
        <div>
          <strong>{mode === "hc" ? (ociConnected ? "OCI metadata ready" : "OCI unavailable") : "Hasnaria Terrace"}</strong>
          <small>{mode === "hc" ? (ociSnapshot ? "Private snapshot" : "Direct metadata") : "Read-only monitoring"}</small>
        </div>
      </div>
    </aside>
  );
}
