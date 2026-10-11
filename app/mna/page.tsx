"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";

// M&A Activity — one card per deal, filterable by industry and deal type.
//
// The record comes from MergerSight's deal write-ups (see
// scripts/build-mna.mjs): the structured facts at the top of each analysis,
// a short excerpt, and a link to the full piece. The analysis itself is
// theirs and is credited on every card.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

type Deal = {
  url: string; title: string; published: string | null; byline: string | null;
  acquirer: string | null; acquirerTicker: string | null;
  target: string | null; targetTicker: string | null;
  value: number | null; currency: string | null;
  announced: string | null; closed: string | null;
  fields: { label: string; value: string }[];
  excerpt: string | null;
  industries: string[]; type: string;
};
type Payload = {
  generatedAt: string;
  industries: { key: string; label: string }[];
  types: { key: string; label: string }[];
  deals: Deal[];
};

// One accent per industry, so a mixed grid still reads at a glance.
const INDUSTRY_COLOR: Record<string, string> = {
  healthcare: "#5BD1EF", consumer: "#F59E0B", tmt: "var(--accent-gold)", industrials: "#7E9887",
  resources: "#14B8A6", energy: "#F97316", financials: "#22C55E", realestate: "#8B5CF6",
};
const TYPE_LABEL: Record<string, string> = { strategic: "Strategic M&A", pe: "Private Equity", ipo: "IPO" };

const SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
function fmtValue(v: number | null, cur: string | null) {
  if (v == null) return null;
  const s = SYM[cur ?? "USD"] ?? "$";
  if (v >= 1e12) return `${s}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${s}${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  return `${s}${Math.round(v / 1e6)}M`;
}
function fmtDate(iso: string | null, long = false) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", long
    ? { month: "long", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}
const pill = (active: boolean, color = "var(--accent-gold)"): React.CSSProperties => ({
  padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${active ? color : "var(--border)"}`,
  background: active ? color : "var(--bg-elevated)",
  color: active ? "var(--on-accent)" : "var(--text-secondary)",
  fontFamily: SANS, fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.04em",
});

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999,
      border: "1px solid var(--border)", background: "var(--bg-elevated)",
      fontFamily: SANS, fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      color: color ?? "var(--text-secondary)",
    }}>
      {color && <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />}
      {children}
    </span>
  );
}

function Party({ name, ticker, size = 28 }: { name: string | null; ticker: string | null; size?: number }) {
  if (!name && !ticker) return null;
  const body = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {ticker && <span style={{ width: size, height: size, flexShrink: 0, display: "inline-flex" }}><CompanyLogo ticker={ticker} size={size} fallback /></span>}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: SANS, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name ?? ticker}</span>
        {ticker && <span style={{ fontFamily: MONO, fontSize: "0.62rem", color: "var(--accent-gold)" }}>{ticker}</span>}
      </span>
    </span>
  );
  return ticker
    ? <Link href={`/research?ticker=${ticker}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", minWidth: 0 }}>{body}</Link>
    : body;
}

export default function MnaPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [industry, setIndustry] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Deal | null>(null);
  const [shown, setShown] = useState(36);

  useEffect(() => {
    let alive = true;
    fetch("/api/mna")
      .then((r) => r.json())
      .then((j) => { if (alive) { if (Array.isArray(j?.deals)) setData(j); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Escape closes the detail panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const deals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.deals ?? []).filter((d) =>
      (industry === "all" || d.industries.includes(industry)) &&
      (type === "all" || d.type === type) &&
      (!q || [d.title, d.acquirer, d.target, d.acquirerTicker, d.targetTicker].some((s) => s?.toLowerCase().includes(q)))
    );
  }, [data, industry, type, query]);

  const totalValue = deals.reduce((t, d) => t + (d.currency === "USD" || !d.currency ? d.value ?? 0 : 0), 0);
  const largest = deals.reduce<Deal | null>((m, d) => (d.value != null && (m == null || d.value > (m.value ?? 0)) ? d : m), null);
  const industryLabel = (k: string) => data?.industries.find((i) => i.key === k)?.label ?? k;

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        M&amp;A Activity
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Acquisitions, buyouts and IPOs, deal by deal — who bought whom, for how much, and who advised. Filter by industry.
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <button type="button" style={pill(industry === "all")} onClick={() => { setIndustry("all"); setShown(36); }}>All industries</button>
        {(data?.industries ?? []).map((i) => (
          <button key={i.key} type="button" style={pill(industry === i.key, INDUSTRY_COLOR[i.key])} onClick={() => { setIndustry(i.key); setShown(36); }}>
            {i.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: "1.2rem" }}>
        <div style={{ display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: 3, gap: 2 }}>
          {[["all", "All deals"], ["strategic", "Strategic M&A"], ["pe", "Private equity"], ["ipo", "IPOs"]].map(([k, lab]) => (
            <button key={k} type="button" onClick={() => { setType(k); setShown(36); }}
              style={{
                padding: "5px 13px", borderRadius: 999, border: "none", cursor: "pointer",
                fontFamily: SANS, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em",
                background: type === k ? "var(--accent-gold)" : "transparent",
                color: type === k ? "var(--on-accent)" : "var(--text-secondary)",
              }}>{lab}</button>
          ))}
        </div>
        <input value={query} onChange={(e) => { setQuery(e.target.value); setShown(36); }} placeholder="Company or ticker"
          style={{
            fontFamily: MONO, fontSize: "0.74rem", padding: "7px 14px", borderRadius: 999, minWidth: 200,
            background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none",
          }} />
        {data && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: "0.66rem", color: "var(--text-muted)" }}>
            {deals.length} {deals.length === 1 ? "deal" : "deals"}
          </span>
        )}
      </div>

      {failed ? (
        <div style={{ ...CARD, padding: "18px 20px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>The deal record didn&apos;t load.</div>
      ) : !data ? (
        <>
          <div style={{ ...CARD, borderColor: "var(--border-active)", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", marginBottom: 14 }}>
            <span className="spinner" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <div style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-gold)" }}>Loading the deal record…</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height: 200, borderRadius: 22 }} />)}
          </div>
        </>
      ) : (
        <>
          {/* Summary of the current view */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.2rem" }}>
            {[
              ["Deals", String(deals.length), industry === "all" ? "across every industry" : industryLabel(industry)],
              ["Combined value", totalValue > 0 ? fmtValue(totalValue, "USD") : "—", "USD-denominated deals with a disclosed value"],
              ["Largest", largest ? fmtValue(largest.value, largest.currency) ?? "—" : "—", largest ? largest.title : ""],
            ].map(([label, value, sub]) => (
              <div key={label} style={{ ...CARD, borderTop: "2px solid var(--accent-gold)", padding: "12px 16px" }}>
                <div style={{ fontSize: "0.56rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)" }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: "1.35rem", fontWeight: 600, marginTop: 4 }}>{value}</div>
                <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
              </div>
            ))}
          </div>

          {deals.length === 0 ? (
            <div style={{ ...CARD, padding: "18px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>No deals match that filter.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {deals.slice(0, shown).map((d) => {
                const color = INDUSTRY_COLOR[d.industries[0]] ?? "var(--text-muted)";
                const value = fmtValue(d.value, d.currency);
                return (
                  <div key={d.url} role="button" tabIndex={0} onClick={() => setOpen(d)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(d); }}
                    className="feature-card"
                    style={{ ...CARD, borderTop: `2px solid ${color}`, padding: "16px 18px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {d.industries.slice(0, 1).map((k) => <Chip key={k} color={INDUSTRY_COLOR[k]}>{industryLabel(k)}</Chip>)}
                        <Chip>{TYPE_LABEL[d.type] ?? d.type}</Chip>
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "0.62rem", color: "var(--text-muted)" }}>{fmtDate(d.published)}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontFamily: SERIF, fontSize: "1rem", fontWeight: 600, lineHeight: 1.3, flex: 1 }}>{d.title}</div>
                      {value && <div style={{ fontFamily: MONO, fontSize: "1.3rem", fontWeight: 700, color, whiteSpace: "nowrap" }}>{value}</div>}
                    </div>

                    {(d.acquirer || d.target) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
                        <Party name={d.type === "ipo" ? (d.target ?? d.acquirer) : d.acquirer} ticker={d.type === "ipo" ? (d.targetTicker ?? d.acquirerTicker) : d.acquirerTicker} />
                        <span style={{ color: "var(--text-muted)", fontFamily: MONO, fontSize: "0.9rem" }}>{d.type === "ipo" ? "" : "→"}</span>
                        {d.type !== "ipo" && <Party name={d.target} ticker={d.targetTicker} />}
                      </div>
                    )}

                    {d.excerpt && (
                      <div style={{ fontSize: "0.72rem", lineHeight: 1.5, color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {d.excerpt}
                      </div>
                    )}
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.6rem", color: "var(--text-muted)" }}>
                      <span>Analysis by MergerSight</span>
                      <span style={{ fontFamily: MONO, color: "var(--accent-gold)" }}>Details →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {deals.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + 36)}
              style={{ ...pill(false), display: "block", margin: "16px auto 0", padding: "9px 22px" }}>
              Show more ({deals.length - shown} remaining)
            </button>
          )}
          <div style={{ fontSize: "0.64rem", color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6 }}>
            Deal facts and excerpts are drawn from MergerSight&apos;s published deal analyses, credited on each card; the full write-ups are theirs. Record refreshed weekly.
          </div>
        </>
      )}

      {/* Detail panel */}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "min(600px, 100vw)", height: "100%", overflowY: "auto", background: "var(--bg-primary)",
            borderLeft: "1px solid var(--border)", padding: "22px 24px 40px", boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {open.industries.map((k) => <Chip key={k} color={INDUSTRY_COLOR[k]}>{industryLabel(k)}</Chip>)}
                <Chip>{TYPE_LABEL[open.type] ?? open.type}</Chip>
              </span>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close"
                style={{ ...pill(false), padding: "5px 11px" }}>✕</button>
            </div>
            <h2 style={{ fontFamily: SERIF, fontSize: "1.4rem", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25, margin: "0 0 6px" }}>{open.title}</h2>
            <div style={{ fontFamily: MONO, fontSize: "0.66rem", color: "var(--text-muted)", marginBottom: 16 }}>
              Published {fmtDate(open.published, true)}
            </div>

            {(open.acquirer || open.target) && (
              <div style={{ ...CARD, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Party name={open.type === "ipo" ? (open.target ?? open.acquirer) : open.acquirer} ticker={open.type === "ipo" ? (open.targetTicker ?? open.acquirerTicker) : open.acquirerTicker} size={36} />
                <span style={{ color: "var(--text-muted)", fontFamily: MONO }}>{open.type === "ipo" ? "" : "→"}</span>
                {open.type !== "ipo" && <Party name={open.target} ticker={open.targetTicker} size={36} />}
              </div>
            )}
            {fmtValue(open.value, open.currency) && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: MONO, fontSize: "2rem", fontWeight: 700, color: INDUSTRY_COLOR[open.industries[0]] ?? "var(--accent-gold)" }}>{fmtValue(open.value, open.currency)}</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>headline deal value</span>
              </div>
            )}

            {open.fields.length > 0 && (
              <>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 6 }}>Deal overview</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", marginBottom: 16 }}>
                  <tbody>
                    {open.fields.map((f, i) => (
                      <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "7px 8px 7px 0", color: "var(--text-secondary)", whiteSpace: "nowrap", verticalAlign: "top", width: "38%" }}>{f.label}</td>
                        <td style={{ padding: "7px 0", fontWeight: 600, lineHeight: 1.45 }}>{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {open.excerpt && (
              <div style={{ ...CARD, padding: "14px 16px", fontSize: "0.8rem", lineHeight: 1.6, color: "var(--text-secondary)", marginBottom: 12 }}>
                {open.excerpt}
              </div>
            )}
            {open.byline && (
              <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 16 }}>{open.byline}</div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={open.url} target="_blank" rel="noopener noreferrer"
                style={{ ...pill(true), padding: "10px 18px", textDecoration: "none" }}>
                Read the full analysis on MergerSight ↗
              </a>
              {[open.acquirerTicker, open.targetTicker].filter(Boolean).map((t) => (
                <Link key={t} href={`/research?ticker=${t}`} style={{ ...pill(false), padding: "10px 16px", textDecoration: "none" }}>Research {t}</Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
