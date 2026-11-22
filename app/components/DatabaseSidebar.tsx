"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  mode: "hc" | "hasnaria" | "oci" | "ai-room" | "ai-vm-oci";
  onUsageClick?: () => void;
  ociConnected?: boolean;
  ociSnapshot?: boolean;
};

function NexusBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`nexus-brand ${compact ? "is-compact" : ""}`} aria-label="NEXUS Control Room">
      <svg className="nexus-brand-mark" viewBox={compact ? "0 0 76 68" : "0 0 340 92"} role="img" aria-label="NEXUS">
        <defs>
          <linearGradient id="nexus-metal" x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".52" stopColor="#DCE5F3" />
            <stop offset="1" stopColor="#8798B2" />
          </linearGradient>
          <linearGradient id="nexus-energy" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#00E5E8" />
            <stop offset=".48" stopColor="#20B8FF" />
            <stop offset="1" stopColor="#B000FF" />
          </linearGradient>
          <filter id="nexus-glow" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {compact ? (
          <g fill="none" stroke="url(#nexus-energy)" strokeWidth="7" strokeLinejoin="miter" filter="url(#nexus-glow)">
            <path d="M8 13 L36 48 L64 13" />
            <path d="M25 13 L53 48 L74 22" />
          </g>
        ) : (
          <>
            <path d="M38 31 C105 -6 227 -5 286 31" fill="none" stroke="url(#nexus-energy)" strokeWidth="3.2" filter="url(#nexus-glow)" />
            <text x="8" y="68" fill="url(#nexus-metal)" fontSize="57" fontWeight="900" fontStyle="italic" letterSpacing="1.2" fontFamily="Arial, Helvetica, sans-serif">NEXUS</text>
            <g fill="none" stroke="url(#nexus-energy)" strokeWidth="5" strokeLinejoin="miter" filter="url(#nexus-glow)">
              <path d="M267 35 L302 55 L267 79" />
              <path d="M291 35 L326 55 L291 79" />
            </g>
            <path d="M5 84 H278 L303 66" fill="none" stroke="url(#nexus-energy)" strokeWidth="2.6" filter="url(#nexus-glow)" />
          </>
        )}
      </svg>
    </div>
  );
}

export default function DatabaseSidebar({
  mode,
  ociConnected = false,
  ociSnapshot = false,
  onUsageClick,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const statusTitle =
    mode === "hc"
      ? ociConnected
        ? "OCI metadata ready"
        : "OCI unavailable"
      : mode === "oci"
        ? "OCI bridge unverified"
        : mode === "ai-room"
          ? "AI Video Gen"
          : mode === "ai-vm-oci"
            ? "AI VM-OCI"
            : "Hasnaria Terrace";

  const statusDescription =
    mode === "hc"
      ? ociSnapshot
        ? "Private snapshot"
        : "Direct metadata"
      : mode === "oci"
        ? "Read-only integration pending"
        : mode === "ai-room"
          ? "Video workspace"
          : mode === "ai-vm-oci"
            ? "OCI operations workspace"
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
          className={`nav-item nexus-nav-item ${mode === "ai-room" ? "active" : ""}`}
          aria-current={mode === "ai-room" ? "page" : undefined}
          title={collapsed ? "AI Video Gen" : undefined}
        >
          <span className="nexus-nav-icon" aria-hidden="true">✦</span>
          {!collapsed && <span className="nexus-nav-label">AI Video Gen</span>}
        </Link>

        <Link
          href="/ai-vm-oci"
          className={`nav-item nexus-nav-item ${mode === "ai-vm-oci" ? "active" : ""}`}
          aria-current={mode === "ai-vm-oci" ? "page" : undefined}
          title={collapsed ? "AI VM-OCI" : undefined}
        >
          <span className="nexus-nav-icon" aria-hidden="true">⌘</span>
          {!collapsed && <span className="nexus-nav-label">AI VM-OCI</span>}
        </Link>

        <button
          type="button"
          className={`nav-item nexus-nav-item ${onUsageClick ? "" : "disabled"}`}
          disabled={!onUsageClick}
          onClick={onUsageClick}
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
