"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  mode: "hc" | "hasnaria" | "oci";
  ociConnected?: boolean;
  ociSnapshot?: boolean;
};

function NexusBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`nexus-brand ${compact ? "is-compact" : ""}`} aria-label="NEXUS Control Room">
      <svg className="nexus-brand-mark" viewBox={compact ? "0 0 70 48" : "0 0 252 58"} role="img" aria-hidden="true">
        <defs>
          <linearGradient id="nexus-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".48" stopColor="#AEBBD0" />
            <stop offset="1" stopColor="#F7FAFF" />
          </linearGradient>
          <linearGradient id="nexus-energy" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#19D5D2" />
            <stop offset=".52" stopColor="#398BFF" />
            <stop offset="1" stopColor="#7658F5" />
          </linearGradient>
          <filter id="nexus-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M8 17 Q29 -2 54 12" fill="none" stroke="url(#nexus-energy)" strokeWidth="2.4" strokeLinecap="round" filter="url(#nexus-glow)" />
        <path d="M12 22 L29 39 L46 22 M28 22 L45 39 L62 22" fill="none" stroke="url(#nexus-energy)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {!compact && <>
          <text x="72" y="34" fill="url(#nexus-metal)" fontSize="29" fontWeight="800" fontStyle="italic" letterSpacing="3">NEXUS</text>
          <path d="M73 43 H239" stroke="url(#nexus-energy)" strokeWidth="1.8" strokeLinecap="round" />
          <text x="74" y="54" fill="#91A1C1" fontSize="7.5" fontWeight="700" letterSpacing="2.5">CONTROL ROOM</text>
        </>}
      </svg>
    </div>
  );
}

export default function DatabaseSidebar({
  mode,
  ociConnected = false,
  ociSnapshot = false,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const statusTitle =
    mode === "hc"
      ? ociConnected
        ? "OCI metadata ready"
        : "OCI unavailable"
      : mode === "oci"
        ? "OCI bridge unverified"
        : "Hasnaria Terrace";

  const statusDescription =
    mode === "hc"
      ? ociSnapshot
        ? "Private snapshot"
        : "Direct metadata"
      : mode === "oci"
        ? "Read-only integration pending"
        : "Read-only monitoring";

  return (
    <aside
      className={`sidebar nexus-sidebar ${collapsed ? "is-collapsed" : ""}`}
    >
      <div className="nexus-sidebar-header">
        <Link
          href="/oci"
          className="nexus-brand-link"
          aria-label="NEXUS Control Room home"
        >
          <NexusBrand compact={collapsed} />
        </Link>

        <button
          type="button"
          className="nexus-collapse-button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="nexus-navigation" aria-label="NEXUS navigation">
        <div className="nexus-nav-section">
          {!collapsed && (
            <span className="nexus-section-label">WORKSPACE</span>
          )}

          <button
            type="button"
            className={`nav-item nexus-nav-item database-parent ${
              mode === "hc" || mode === "hasnaria" ? "active" : ""
            }`}
            aria-expanded={expanded}
            aria-controls="database-subnav"
            title={collapsed ? "Applications" : undefined}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                setExpanded(true);
              } else {
                setExpanded((current) => !current);
              }
            }}
          >
            <span className="nexus-nav-icon" aria-hidden="true">▦</span>
            {!collapsed && (
              <>
                <span className="nexus-nav-label">Applications</span>
                <span className="nav-caret" aria-hidden="true">
                  {expanded ? "⌄" : "›"}
                </span>
              </>
            )}
          </button>

          {expanded && (
            <div
              id="database-subnav"
              className="database-subnav nexus-subnav"
            >
              <Link
                href="/database/hc-connect"
                className={`nav-item subnav-link nexus-nav-item ${
                  mode === "hc" ? "active" : ""
                }`}
                aria-current={mode === "hc" ? "page" : undefined}
                title={collapsed ? "HC Connect" : undefined}
              >
                <span className="nexus-nav-icon" aria-hidden="true">▤</span>
                {!collapsed && (
                  <span className="nexus-nav-label">HC Connect</span>
                )}
              </Link>

              <Link
                href="/database/hasnaria-terrace"
                className={`nav-item subnav-link nexus-nav-item ${
                  mode === "hasnaria" ? "active" : ""
                }`}
                aria-current={mode === "hasnaria" ? "page" : undefined}
                title={collapsed ? "Hasnaria Terrace" : undefined}
              >
                <span className="nexus-nav-icon" aria-hidden="true">◈</span>
                {!collapsed && (
                  <span className="nexus-nav-label">Hasnaria Terrace</span>
                )}
              </Link>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="nexus-nav-section">
            <span className="nexus-section-label">INFRASTRUCTURE</span>
          </div>
        )}

        <Link
          href="/oci"
          className={`nav-item nexus-nav-item ${
            mode === "oci" ? "active" : ""
          }`}
          aria-current={mode === "oci" ? "page" : undefined}
          title={collapsed ? "OCI Infrastructure" : undefined}
        >
          <span className="nexus-nav-icon" aria-hidden="true">◉</span>
          {!collapsed && (
            <span className="nexus-nav-label">OCI Infrastructure</span>
          )}
        </Link>

        {!collapsed && (
          <div className="nexus-nav-section">
            <span className="nexus-section-label">INTELLIGENCE</span>
          </div>
        )}

        <Link
          href="/ai-room"
          className="nav-item nexus-nav-item"
          title={collapsed ? "AI ROOM" : undefined}
        >
          <span className="nexus-nav-icon" aria-hidden="true">✦</span>
          {!collapsed && <span className="nexus-nav-label">AI ROOM</span>}
        </Link>

        <button
          type="button"
          className="nav-item nexus-nav-item disabled"
          disabled
          title={collapsed ? "Usage & Cost — Soon" : undefined}
        >
          <span className="nexus-nav-icon" aria-hidden="true">◌</span>
          {!collapsed && (
            <>
              <span className="nexus-nav-label">Usage &amp; Cost</span>
              <small>Soon</small>
            </>
          )}
        </button>
      </nav>

      <div className="nexus-sidebar-footer">
        <span
          className={`status-dot ${
            mode === "hc"
              ? ociConnected
                ? "online"
                : "offline"
              : mode === "oci"
                ? "offline"
                : "neutral"
          }`}
        />
        {!collapsed && (
          <div className="nexus-status-copy">
            <strong>{statusTitle}</strong>
            <small>{statusDescription}</small>
          </div>
        )}
      </div>
    </aside>
  );
}
