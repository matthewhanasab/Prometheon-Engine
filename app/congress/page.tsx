"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CongressTrade {
  chamber: "senate" | "house";
  symbol: string | null;
  disclosureDate: string | null;
  transactionDate: string | null;
  firstName: string;
  lastName: string;
  office: string | null;
  district: string | null;
  owner: string | null;
  assetDescription: string | null;
  assetType: string | null;
  type: string | null;
  amount: string | null;
  comment: string | null;
  link: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isPurchase(type: string | null): boolean {
  return (type ?? "").toLowerCase().includes("purchase");
}
function isSale(type: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t.includes("sale") || t.includes("sold");
}
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Sans', sans-serif",
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
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", width: "fit-content" }}>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding: "0.4rem 0.9rem",
          fontSize: "0.72rem",
          fontWeight: 600,
          background: value === o.key ? "var(--accent-gold)" : "transparent",
          color: value === o.key ? "#131C2E" : "var(--text-secondary)",
          border: "none",
          cursor: "pointer",
          fontFamily: "'IBM Plex Sans', sans-serif",
          whiteSpace: "nowrap",
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChamberBadge({ chamber }: { chamber: "senate" | "house" }) {
  const isS = chamber === "senate";
  return (
    <span style={{
      display: "inline-block",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "0.62rem",
      fontWeight: 700,
      color: isS ? "#5B8DEF" : "#14B8A6",
      background: isS ? "rgba(91,141,239,0.12)" : "rgba(20,184,166,0.12)",
      border: `1px solid ${isS ? "rgba(91,141,239,0.4)" : "rgba(20,184,166,0.4)"}`,
      borderRadius: 3,
      padding: "1px 6px",
      marginLeft: 8,
    }}>
      {isS ? "S" : "H"}
    </span>
  );
}

function EmptyHint({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{
      border: "1px dashed var(--border-active)", borderRadius: 4, background: "var(--bg-surface)",
      padding: "28px 20px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{sub}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
// Lower bound of a disclosure range like "$1,001 - $15,000" -> 1001
function amountLowerBound(amount: string | null): number {
  if (!amount) return 0;
  const m = amount.replace(/,/g, "").match(/\$([0-9]+)/);
  return m ? parseInt(m[1]) : 0;
}

const AMOUNT_OPTIONS = [
  { key: 0,        label: "Any" },
  { key: 15001,    label: "$15K+" },
  { key: 50001,    label: "$50K+" },
  { key: 100001,   label: "$100K+" },
  { key: 250001,   label: "$250K+" },
  { key: 1000001,  label: "$1M+" },
];

function CongressInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"latest" | "ticker">("latest");
  const [input, setInput] = useState("");
  const [searched, setSearched] = useState("");
  const [chamber, setChamber] = useState<"all" | "senate" | "house">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "purchases" | "sales">("all");
  const [minAmount, setMinAmount] = useState(0);
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function load(ticker?: string) {
    setLoading(true); setError(null);
    try {
      const url = ticker ? `/api/congress?ticker=${encodeURIComponent(ticker)}` : "/api/congress";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTrades(data.trades ?? []);
      setRan(true);
    } catch {
      setError("Could not load congressional trading data. Try again.");
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
    if (chamber !== "all" && t.chamber !== chamber) return false;
    if (typeFilter === "purchases" && !isPurchase(t.type)) return false;
    if (typeFilter === "sales" && !isSale(t.type)) return false;
    if (minAmount > 0 && amountLowerBound(t.amount) < minAmount) return false;
    return true;
  });

  const nPurch = filtered.filter((t) => isPurchase(t.type)).length;
  const nSales = filtered.filter((t) => isSale(t.type)).length;

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
    color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px", borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
        Congress Trading
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.45, maxWidth: 200, marginBottom: "0.9rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Stock trades disclosed by U.S. Senators and Representatives — follow the smart (and not-so-smart) money on Capitol Hill
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <label style={LABEL_STYLE}>Mode</label>
          <ToggleGroup
            options={[{ key: "latest" as const, label: "Latest Trades" }, { key: "ticker" as const, label: "Search by Ticker" }]}
            value={mode} onChange={switchMode} />
        </div>
        {mode === "ticker" && (
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { setSearched(input.trim().toUpperCase()); load(input.trim()); } }}
            style={{ display: "flex", gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
              style={{
                width: 130, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4,
                padding: "8px 12px", color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.8rem", outline: "none",
              }} />
            <button type="submit" style={{
              background: "var(--accent-gold)", color: "#131C2E", border: "none", borderRadius: 4,
              padding: "8px 18px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
            }}>Search</button>
          </form>
        )}
        <div>
          <label style={LABEL_STYLE}>Chamber</label>
          <ToggleGroup
            options={[{ key: "all" as const, label: "All" }, { key: "senate" as const, label: "Senate" }, { key: "house" as const, label: "House" }]}
            value={chamber} onChange={setChamber} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Type</label>
          <ToggleGroup
            options={[{ key: "all" as const, label: "All" }, { key: "purchases" as const, label: "Purchases" }, { key: "sales" as const, label: "Sales" }]}
            value={typeFilter} onChange={setTypeFilter} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Min Amount</label>
          <ToggleGroup
            options={AMOUNT_OPTIONS.map(o => ({ key: o.key as any, label: o.label }))}
            value={minAmount as any} onChange={(v: any) => setMinAmount(Number(v))} />
        </div>
      </div>

      {loading && (
        <div style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
          Loading disclosures…
        </div>
      )}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {/* Empty states */}
      {!loading && !error && mode === "ticker" && !ran && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <EmptyHint title="Search any ticker" sub="See every Senate and House trade in that stock" />
          <EmptyHint title="Disclosure lag flagged" sub="Trades disclosed more than 45 days late are marked in gold" />
          <EmptyHint title="Straight to research" sub="Click any ticker to open the full research page" />
        </div>
      )}

      {!loading && !error && ran && filtered.length === 0 && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4,
          padding: "48px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem",
        }}>
          No disclosed trades found{searched ? ` for ${searched}` : ""} with the selected filters.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Summary strip */}
          <div style={{
            marginBottom: "0.75rem", padding: "0.6rem 1rem", background: "var(--bg-surface)",
            border: "1px solid var(--border)", borderRadius: 4, fontSize: "0.78rem",
            color: "var(--text-secondary)", display: "flex", gap: "1.5rem", flexWrap: "wrap",
          }}>
            <span><strong style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace" }}>{filtered.length}</strong> trades shown</span>
            <span style={{ color: "var(--positive)" }}>{nPurch} purchases</span>
            <span style={{ color: "var(--negative)" }}>{nSales} sales</span>
            {searched && <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace", color: "var(--accent-gold)" }}>{searched}</span>}
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.76rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={th}>Politician</th>
                  <th style={th}>Office</th>
                  <th style={th}>Ticker</th>
                  <th style={th}>Transaction</th>
                  <th style={{ ...th, textAlign: "right" }}>Amount</th>
                  <th style={{ ...th, textAlign: "right" }}>Traded</th>
                  <th style={{ ...th, textAlign: "right" }}>Disclosed</th>
                  <th style={{ ...th, textAlign: "center" }}>Src</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const purchase = isPurchase(t.type);
                  const sale = isSale(t.type);
                  const lag = daysBetween(t.transactionDate, t.disclosureDate);
                  const fullName = `${t.firstName} ${t.lastName}`.trim().toLowerCase();
                  const rawOffice = t.chamber === "house" ? (t.district || t.office) : t.office;
                  const office = rawOffice && rawOffice.trim().toLowerCase() !== fullName ? rawOffice : "—";
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                      <td style={{ ...td, color: "var(--text-primary)", fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.8rem" }}>
                        {t.firstName} {t.lastName}
                        <ChamberBadge chamber={t.chamber} />
                      </td>
                      <td style={{ ...td, fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {office}
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
                          padding: "2px 8px", borderRadius: 3, fontSize: "0.68rem", fontWeight: 600,
                        }}>
                          {t.type ?? "—"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{t.amount ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{t.transactionDate ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {t.disclosureDate ?? "—"}
                        {lag != null && (
                          <span style={{
                            marginLeft: 6, fontSize: "0.62rem",
                            color: lag > 45 ? "var(--accent-gold)" : "var(--text-muted)",
                            fontWeight: lag > 45 ? 700 : 400,
                          }}>
                            +{lag}d
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {t.link ? (
                          <a href={t.link} target="_blank" rel="noopener noreferrer" title="Source disclosure"
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
            STOCK Act disclosures · Amounts are reported ranges · Gold +days = disclosed more than 45 days after trade · Not financial advice
          </div>
        </>
      )}
    </div>
  );
}

export default function CongressPage() {
  return <Suspense fallback={null}><CongressInner /></Suspense>;
}
