"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Amount {
  label: string;
  low: number | null;
  high: number | null;
}
interface CongressTrade {
  chamber: "house" | "senate";
  member: string;
  state: string | null;
  ticker: string;
  action: "purchase" | "sale" | "sale_partial" | "exchange" | "other";
  transactionDate: string;
  disclosedDate: string | null;
  amount: Amount;
  source: string;
  // Set when the filing's own dates are impossible (trade in the future, or
  // notified before it happened). Kept as filed and marked, never corrected.
  suspectDate?: boolean;
}
interface Coverage {
  housePtrTotal: number;
  housePaperSkipped: number;
  senatePtrTotal: number;
  senatePaperSkipped: number;
  tradesParsed: number;
  members: number;
  tickers: number;
  note: string;
}
interface Payload {
  generatedAt: string;
  years: string[];
  total: number;
  count: number;
  totals: {
    purchases: number;
    sales: number;
    purchaseVolume: number;
    saleVolume: number;
    members: number;
  };
  topTickers: [string, number][];
  coverage: Coverage;
  trades: CongressTrade[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const BUY = new Set(["purchase"]);
const SELL = new Set(["sale", "sale_partial"]);

function actionLabel(a: CongressTrade["action"]): string {
  if (a === "purchase") return "Purchase";
  if (a === "sale") return "Sale";
  if (a === "sale_partial") return "Sale (partial)";
  if (a === "exchange") return "Exchange";
  return "Other";
}
function actionColor(a: CongressTrade["action"]): string {
  if (BUY.has(a)) return "var(--positive)";
  if (SELL.has(a)) return "var(--negative)";
  return "var(--text-secondary)";
}
function fmtCompact(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}
function lagDays(t: CongressTrade): number | null {
  if (!t.disclosedDate) return null;
  const a = new Date(t.transactionDate).getTime();
  const b = new Date(t.disclosedDate).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function ToggleGroup<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 22, overflow: "hidden", width: "fit-content" }}>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding: "0.4rem 0.9rem",
          fontSize: "0.72rem",
          fontWeight: 600,
          background: value === o.key ? "var(--accent-gold)" : "transparent",
          color: value === o.key ? "var(--on-accent)" : "var(--text-secondary)",
          border: "none",
          cursor: "pointer",
          fontFamily: "'Public Sans', sans-serif",
          whiteSpace: "nowrap",
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "0.58rem",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--text-secondary)",
  marginBottom: "0.45rem",
};

const MONO: React.CSSProperties = { fontFamily: "'Spline Sans Mono', monospace" };

export default function CongressPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chamber, setChamber] = useState<"all" | "house" | "senate">("all");
  const [side, setSide] = useState<"all" | "buys" | "sells">("all");
  const [query, setQuery] = useState("");

  // Filtering happens on the server. There are ~10k disclosures behind this
  // page and only a window of them is ever sent down, so filtering the loaded
  // window client-side would quietly search a slice while looking like it
  // searched everything.
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ limit: "500" });
    if (chamber !== "all") params.set("chamber", chamber);
    if (side !== "all") params.set("side", side);
    const q = query.trim();
    if (q) params.set("q", q);

    const run = () => {
      fetch(`/api/congress-trades?${params}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j) => { if (live) { setData(j); setError(null); } })
        .catch((e) => { if (live) setError(e.message); });
    };
    const t = setTimeout(run, query ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [chamber, side, query]);

  const rows = data?.trades ?? [];

  const th: React.CSSProperties = {
    textAlign: "left", padding: "0.6rem 0.7rem", fontSize: "0.58rem", textTransform: "uppercase",
    letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg-primary)",
  };
  const td: React.CSSProperties = { padding: "0.55rem 0.7rem", fontSize: "0.8rem", whiteSpace: "nowrap" };

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
        Congress Trades
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.45, maxWidth: 200, marginBottom: "0.9rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        STOCK Act periodic transaction reports — what sitting members of Congress disclose trading
      </div>

      {error && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "1rem 1.2rem", fontSize: "0.8rem", color: "var(--negative)" }}>
          Couldn&rsquo;t load the disclosure snapshot: {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading disclosures…</div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: "1.6rem" }}>
            {[
              { label: "Disclosed trades", value: data.total.toLocaleString("en-US"), tone: "var(--accent-gold)" },
              { label: "Purchases", value: data.totals.purchases.toLocaleString("en-US"), sub: `≈ ${fmtCompact(data.totals.purchaseVolume)}`, tone: "var(--positive)" },
              { label: "Sales", value: data.totals.sales.toLocaleString("en-US"), sub: `≈ ${fmtCompact(data.totals.saleVolume)}`, tone: "var(--negative)" },
              { label: "Members", value: data.totals.members.toLocaleString("en-US"), tone: "var(--accent-gold)" },
            ].map((c) => (
              <div key={c.label} style={{
                background: "var(--bg-surface)", border: "1px solid var(--border)", borderTop: `2px solid ${c.tone}`,
                borderRadius: 22, padding: "0.9rem 1rem",
              }}>
                <div style={{ ...LABEL_STYLE, marginBottom: "0.5rem" }}>{c.label}</div>
                <div style={{ ...MONO, fontSize: "1.35rem", fontWeight: 500 }}>{c.value}</div>
                {c.sub && <div style={{ ...MONO, fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.4rem" }}>
            <div>
              <label style={LABEL_STYLE}>Chamber</label>
              <ToggleGroup
                options={[
                  { key: "all" as const, label: "Both" },
                  { key: "house" as const, label: "House" },
                  { key: "senate" as const, label: "Senate" },
                ]}
                value={chamber} onChange={setChamber} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Side</label>
              <ToggleGroup
                options={[
                  { key: "all" as const, label: "All" },
                  { key: "buys" as const, label: "Purchases" },
                  { key: "sells" as const, label: "Sales" },
                ]}
                value={side} onChange={setSide} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Filter</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ticker or member"
                style={{
                  width: 190, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22,
                  padding: "8px 14px", color: "var(--text-primary)", ...MONO, fontSize: "0.8rem", outline: "none",
                }} />
            </div>
          </div>

          {/* Most-traded tickers */}
          {data.topTickers.length > 0 && (
            <div style={{ marginBottom: "1.6rem" }}>
              <div style={{ ...LABEL_STYLE, borderBottom: "1px solid var(--border)", paddingBottom: "0.45rem", marginBottom: "0.7rem" }}>
                Most disclosed tickers
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.topTickers.map(([tk, n]) => (
                  <button key={tk} onClick={() => setQuery(tk)} style={{
                    background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999,
                    padding: "0.32rem 0.8rem", color: "var(--text-primary)", ...MONO, fontSize: "0.75rem", cursor: "pointer",
                  }}>
                    {tk} <span style={{ color: "var(--text-muted)" }}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
            overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto", maxHeight: "70vh" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Traded</th>
                    <th style={th}>Member</th>
                    <th style={th}>Chamber</th>
                    <th style={th}>Ticker</th>
                    <th style={th}>Action</th>
                    <th style={{ ...th, textAlign: "right" }}>Amount range</th>
                    <th style={{ ...th, textAlign: "right" }}>Lag</th>
                    <th style={th}>Filing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t, i) => {
                    const lag = lagDays(t);
                    return (
                      <tr key={`${t.source}-${t.ticker}-${t.transactionDate}-${i}`}
                        style={{ background: i % 2 ? "var(--bg-surface)" : "transparent" }}>
                        <td style={{ ...td, ...MONO, color: "var(--text-secondary)" }}>
                          {t.transactionDate}
                          {t.suspectDate && (
                            <span title="The filing's own dates are inconsistent — shown as filed, not corrected."
                              style={{ color: "var(--negative)", marginLeft: 5, cursor: "help" }}>*</span>
                          )}
                        </td>
                        <td style={{ ...td, maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.member}
                          {t.state && <span style={{ color: "var(--text-muted)", ...MONO, fontSize: "0.7rem" }}> {t.state}</span>}
                        </td>
                        <td style={{ ...td, color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "capitalize" }}>{t.chamber}</td>
                        <td style={{ ...td, ...MONO }}>
                          <Link href={`/research?ticker=${t.ticker}`} style={{ color: "var(--accent-gold)", textDecoration: "none" }}>
                            {t.ticker}
                          </Link>
                        </td>
                        <td style={{ ...td, color: actionColor(t.action), fontSize: "0.75rem" }}>{actionLabel(t.action)}</td>
                        <td style={{ ...td, ...MONO, textAlign: "right" }}>{t.amount.label}</td>
                        <td style={{ ...td, ...MONO, textAlign: "right", color: lag != null && lag > 45 ? "var(--negative)" : "var(--text-secondary)" }}>
                          {lag == null ? "—" : `${lag}d`}
                        </td>
                        <td style={td}>
                          <a href={t.source} target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--text-secondary)", fontSize: "0.72rem", textDecoration: "none" }}>
                            View →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.total > rows.length && (
              <div style={{ padding: "0.7rem 1rem", fontSize: "0.7rem", color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
                Showing the {rows.length.toLocaleString("en-US")} most recent of {data.total.toLocaleString("en-US")} matching disclosures — narrow the filter to see older ones.
              </div>
            )}
            {rows.length === 0 && (
              <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                No disclosures match this filter.
              </div>
            )}
          </div>

          {/* Coverage — stated plainly rather than implying the set is complete */}
          <div style={{ marginTop: "1.4rem", fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Covering {data.years.join(" and ")} · {data.coverage.tradesParsed.toLocaleString("en-US")} transactions
            from {data.coverage.housePtrTotal.toLocaleString("en-US")} House and {data.coverage.senatePtrTotal.toLocaleString("en-US")} Senate
            periodic transaction reports.{" "}
            {(data.coverage.housePaperSkipped + data.coverage.senatePaperSkipped).toLocaleString("en-US")} filings
            submitted on paper are excluded — those are scans with no text to read.
            Amounts are the ranges the STOCK Act requires; exact values are never disclosed, and the totals above use
            range midpoints. Rows marked <span style={{ color: "var(--negative)" }}>*</span> carry dates the filing
            itself got wrong — shown as filed rather than corrected. Snapshot generated {new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.{" "}
            <Link href="/insider" style={{ color: "var(--accent-gold)", textDecoration: "none" }}>Insider trading (Form 4) →</Link>
          </div>
        </>
      )}
    </div>
  );
}
