"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
interface InsiderTrade {
  symbol: string | null;
  filingDate: string | null;
  transactionDate: string | null;
  insider: string | null;
  role: string | null;
  type: string | null;
  ad: string | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  security: string | null;
  formType: string | null;
  url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isPurchase(type: string | null): boolean {
  return (type ?? "").toUpperCase().startsWith("P");
}
function isSale(type: string | null): boolean {
  return (type ?? "").toUpperCase().startsWith("S");
}
function isAward(type: string | null): boolean {
  const c = (type ?? "").toUpperCase().charAt(0);
  return c === "A" || c === "G" || c === "M";
}
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}
function fmtDate(d: string | null): string {
  if (!d) return "—";
  return d.slice(0, 10);
}
function fmtShares(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtPrice(n: number | null): string {
  if (n == null || n === 0) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtValue(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Public Sans', sans-serif",
  fontSize: "0.58rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--text-secondary)",
  marginBottom: 4,
  display: "block",
};

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
          color: value === o.key ? "#04110A" : "var(--text-secondary)",
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

function EmptyHint({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{
      border: "1px dashed var(--border-active)", borderRadius: 22, background: "var(--bg-surface)",
      padding: "28px 20px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{sub}</div>
    </div>
  );
}

const VALUE_OPTIONS = [
  { key: 0,        label: "Any" },
  { key: 50000,    label: "$50K+" },
  { key: 250000,   label: "$250K+" },
  { key: 1000000,  label: "$1M+" },
  { key: 10000000, label: "$10M+" },
];

// ── Page ──────────────────────────────────────────────────────────────────────
function InsiderInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"latest" | "ticker">("latest");
  const [input, setInput] = useState("");
  const [searched, setSearched] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "purchases" | "sales" | "awards">("all");
  const [minValue, setMinValue] = useState(0);
  const [trades, setTrades] = useState<InsiderTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function load(symbol?: string) {
    setLoading(true); setError(null);
    try {
      const url = symbol ? `/api/insider?symbol=${encodeURIComponent(symbol)}` : "/api/insider";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTrades(data.trades ?? []);
      setRan(true);
    } catch {
      setError("Could not load insider trading data. Try again.");
      setTrades([]);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) {
      const sym = t.toUpperCase();
      setMode("ticker");
      setInput(sym);
      setSearched(sym);
      load(sym);
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(m: "latest" | "ticker") {
    setMode(m);
    if (m === "latest") { setSearched(""); load(); }
    else { setTrades([]); setRan(false); }
  }

  const filtered = trades.filter((t) => {
    if (typeFilter === "purchases" && !isPurchase(t.type)) return false;
    if (typeFilter === "sales" && !isSale(t.type)) return false;
    if (typeFilter === "awards" && !isAward(t.type)) return false;
    if (minValue > 0 && (t.value == null || t.value < minValue)) return false;
    return true;
  });

  const nPurch = filtered.filter((t) => isPurchase(t.type)).length;
  const nSales = filtered.filter((t) => isSale(t.type)).length;

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontFamily: "'Public Sans', sans-serif",
    fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
    color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px", borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
        Insider Trading
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.45, maxWidth: 200, marginBottom: "0.9rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        SEC Form 4 filings — what executives and directors are doing with their own money
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <label style={LABEL_STYLE}>Mode</label>
          <ToggleGroup
            options={[{ key: "latest" as const, label: "Latest Filings" }, { key: "ticker" as const, label: "Search by Ticker" }]}
            value={mode} onChange={switchMode} />
        </div>
        {mode === "ticker" && (
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { setSearched(input.trim().toUpperCase()); load(input.trim()); } }}
            style={{ display: "flex", gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
              style={{
                width: 130, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22,
                padding: "8px 12px", color: "var(--text-primary)", fontFamily: "'Spline Sans Mono', monospace",
                fontSize: "0.8rem", outline: "none",
              }} />
            <button type="submit" style={{
              background: "var(--accent-gold)", color: "#04110A", border: "none", borderRadius: 22,
              padding: "8px 18px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
            }}>Search</button>
          </form>
        )}
        <div>
          <label style={LABEL_STYLE}>Type</label>
          <ToggleGroup
            options={[
              { key: "all" as const, label: "All" },
              { key: "purchases" as const, label: "Purchases" },
              { key: "sales" as const, label: "Sales" },
              { key: "awards" as const, label: "Awards & Grants" },
            ]}
            value={typeFilter} onChange={setTypeFilter} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Min Value</label>
          <ToggleGroup
            options={VALUE_OPTIONS.map(o => ({ key: o.key as any, label: o.label }))}
            value={minValue as any} onChange={(v: any) => setMinValue(Number(v))} />
        </div>
      </div>

      {loading && (
        <div style={{ color: "var(--text-secondary)", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
          Loading filings…
        </div>
      )}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {/* Empty states */}
      {!loading && !error && mode === "ticker" && !ran && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <EmptyHint title="Search any ticker" sub="See every Form 4 filed by that company's insiders" />
          <EmptyHint title="Open-market buys stand out" sub="Purchases are the strongest insider signal — awards and sales less so" />
          <EmptyHint title="Straight to the source" sub="Every row links to the original SEC filing" />
        </div>
      )}

      {!loading && !error && ran && filtered.length === 0 && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
          padding: "48px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem",
        }}>
          No insider filings found{searched ? ` for ${searched}` : ""} with the selected filters.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Summary strip */}
          <div style={{
            marginBottom: "0.75rem", padding: "0.6rem 1rem", background: "var(--bg-surface)",
            border: "1px solid var(--border)", borderRadius: 22, fontSize: "0.78rem",
            color: "var(--text-secondary)", display: "flex", gap: "1.5rem", flexWrap: "wrap",
          }}>
            <span><strong style={{ color: "var(--text-primary)", fontFamily: "'Spline Sans Mono', monospace" }}>{filtered.length}</strong> filings shown</span>
            <span style={{ color: "var(--positive)" }}>{nPurch} purchases</span>
            <span style={{ color: "var(--negative)" }}>{nSales} sales</span>
            {searched && <span style={{ marginLeft: "auto", fontFamily: "'Spline Sans Mono', monospace", color: "var(--accent-gold)" }}>{searched}</span>}
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 22 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.76rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={th}>Insider</th>
                  <th style={th}>Ticker</th>
                  <th style={th}>Type</th>
                  <th style={{ ...th, textAlign: "right" }}>Shares</th>
                  <th style={{ ...th, textAlign: "right" }}>Price</th>
                  <th style={{ ...th, textAlign: "right" }}>Est. Value</th>
                  <th style={{ ...th, textAlign: "right" }}>Trans. Date</th>
                  <th style={{ ...th, textAlign: "right" }}>Filed</th>
                  <th style={{ ...th, textAlign: "center" }}>Src</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const purchase = isPurchase(t.type);
                  const sale = isSale(t.type);
                  const lag = daysBetween(t.transactionDate, t.filingDate);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                      <td style={{ ...td, fontFamily: "'Public Sans', sans-serif" }}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.8rem" }}>{t.insider ?? "—"}</div>
                        {t.role && (
                          <div style={{ fontSize: "0.64rem", color: "var(--text-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.role}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {t.symbol ? (
                          <Link href={`/research?ticker=${t.symbol}`} style={{ color: "var(--accent-gold)", fontWeight: 700, textDecoration: "none" }}>
                            {t.symbol}
                          </Link>
                        ) : "—"}
                      </td>
                      <td style={td}>
                        <span style={{
                          background: purchase ? "rgba(34,197,94,0.12)" : sale ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.1)",
                          color: purchase ? "var(--positive)" : sale ? "var(--negative)" : "var(--text-secondary)",
                          padding: "2px 8px", borderRadius: 24, fontSize: "0.68rem", fontWeight: 600,
                        }}>
                          {t.type ?? "—"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtShares(t.shares)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtPrice(t.price)}</td>
                      <td style={{
                        ...td, textAlign: "right",
                        color: t.value != null && t.value >= 1000000 ? "var(--accent-gold)" : "var(--text-secondary)",
                        fontWeight: t.value != null && t.value >= 1000000 ? 700 : 400,
                      }}>
                        {fmtValue(t.value)}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtDate(t.transactionDate)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {fmtDate(t.filingDate)}
                        {lag != null && (
                          <span style={{
                            marginLeft: 6, fontSize: "0.62rem",
                            color: lag > 30 ? "var(--accent-gold)" : "var(--text-muted)",
                            fontWeight: lag > 30 ? 700 : 400,
                          }}>
                            +{lag}d
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {t.url ? (
                          <a href={t.url} target="_blank" rel="noopener noreferrer" title="SEC filing"
                            style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.8rem" }}>↗</a>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: 8 }}>
            SEC Form 4 disclosures · Est. value = shares × reported price · Gold +days = filed more than 30 days after trade · Not financial advice
          </div>
        </>
      )}
    </div>
  );
}

export default function InsiderPage() {
  return <Suspense fallback={null}><InsiderInner /></Suspense>;
}
