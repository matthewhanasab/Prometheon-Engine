"use client";

import { useState, Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import Icon from "@/components/Icon";
import { ErrorNote, SkeletonTable } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";

interface Filing {
  date: string;
  form: string;
  description: string;
  url: string;
}

interface Insider {
  date: string;
  name: string;
  title: string;
  type: "BUY" | "SELL" | "OTHER";
  shares: number;
  price: number | null;
  value: number | null;
  owned: number | null;
}

// Form types take a colour from the site's chart series so the badges hold
// their contrast in both themes.
const tint = (c: string) => `color-mix(in srgb, ${c} 16%, transparent)`;
const FORM_COLORS: Record<string, { bg: string; color: string }> = {
  "10-K":    { bg: tint("var(--accent-gold)"), color: "var(--accent-gold)" },
  "10-Q":    { bg: tint("var(--series-3)"),    color: "var(--series-3)" },
  "8-K":     { bg: tint("var(--text-muted)"),  color: "var(--text-secondary)" },
  "4":       { bg: tint("var(--positive)"),    color: "var(--positive)" },
  "S-1":     { bg: tint("var(--series-5)"),    color: "var(--series-5)" },
  "DEF 14A": { bg: tint("var(--series-2)"),    color: "var(--series-2)" },
};

function formBadge(form: string) {
  const style = FORM_COLORS[form] ?? { bg: tint("var(--text-muted)"), color: "var(--text-secondary)" };
  return (
    <span style={{
      display: "inline-block",
      background: style.bg,
      color: style.color,
      fontWeight: 700,
      fontSize: "0.72rem",
      padding: "0.18rem 0.55rem",
      borderRadius: 22,
      fontFamily: "'Spline Sans Mono', monospace",
      letterSpacing: "0.04em",
      whiteSpace: "nowrap",
    }}>
      {form}
    </span>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000)     return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toLocaleString();
}

function fmtShares(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

const thStyle: React.CSSProperties = {
  padding: "0.55rem 1rem",
  textAlign: "left",
  color: "var(--text-secondary)",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  fontWeight: 600,
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-elevated)",
};

const tdStyle: React.CSSProperties = {
  padding: "0.55rem 1rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.83rem",
  verticalAlign: "middle",
};

function SecInner() {
  // Opens on a worked example, like the other company pages.
  const [ticker, setTicker] = useUrlTicker("AAPL");
  const { data, shown, loading, stale, error, retry } = useTickerData<{ filings?: Filing[]; insiders?: Insider[] }>(ticker, (t) => `/api/sec/${t}`);
  const filings = data?.filings ?? [];
  const insiders = data?.insiders ?? [];
  const activeTicker = shown;
  // The page of insider rows, remembered per company so a new lookup starts at the top.
  const [paging, setPaging] = useState<{ ticker: string | null; page: number }>({ ticker: null, page: 0 });
  const insiderPage = paging.ticker === activeTicker ? paging.page : 0;
  const setInsiderPage = (fn: (p: number) => number) => setPaging({ ticker: activeTicker, page: fn(insiderPage) });

  const INSIDER_PAGE_SIZE = 15;

  const insiderSlice = insiders.slice(insiderPage * INSIDER_PAGE_SIZE, (insiderPage + 1) * INSIDER_PAGE_SIZE);
  const totalInsiderPages = Math.ceil(insiders.length / INSIDER_PAGE_SIZE);

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)" }}>
      <PageHeader title="SEC Filings"
        subtitle="A company's most recent filings and insider transactions, each linked to the original document on EDGAR.">
        <TickerInput value={ticker} onSubmit={setTicker} loading={loading} action="Load" />
      </PageHeader>

      {error && <ErrorNote title={`${ticker} didn't load`} message={lookupErrorText(error)} onRetry={retry} />}

      {loading && !data && <SkeletonTable rows={10} />}

      {data && activeTicker && (
        <div className={stale ? "is-stale" : undefined} aria-busy={stale}>
          {/* Recent Filings */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 24, overflow: "hidden", marginBottom: "1.75rem" }}>
            <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Recent Filings <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)", marginLeft: 6 }}>{activeTicker}</span></h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.76rem", margin: "0.15rem 0 0" }}>Last 30 filings from EDGAR</p>
              </div>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>{filings.length} filings</span>
            </div>
            {filings.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>No filings found.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Form Type</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filings.map((f, i) => (
                      <tr key={i} className="row-hover">
                        <td style={{ ...tdStyle, fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {f.date}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                          {formBadge(f.form)}
                        </td>
                        <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                          {f.description || "—"}
                        </td>
                        <td style={tdStyle}>
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tap"
                              style={{ color: "var(--accent-gold)", fontSize: "0.8rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem", position: "relative" }}
                            >
                              View <Icon name="external" size={13} />
                              <span className="sr-only"> {f.form} filed {f.date} (opens on sec.gov)</span>
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Insider Transactions */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 24, overflow: "hidden" }}>
            <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Insider Transactions</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.76rem", margin: "0.15rem 0 0" }}>Form 4 filings · Recent insider buying &amp; selling</p>
              </div>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>{insiders.length} transactions</span>
            </div>
            {insiders.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>No insider transactions found.</div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Date", "Insider", "Title", "Type", "Shares", "Price", "Value", "Shares Owned"].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {insiderSlice.map((ins, i) => (
                        <tr key={i} className="row-hover">
                          <td style={{ ...tdStyle, fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {ins.date}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: "nowrap" }}>{ins.name}</td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: "0.78rem" }}>{ins.title}</td>
                          <td style={tdStyle}>
                            <span style={{
                              display: "inline-block",
                              background: tint(ins.type === "BUY" ? "var(--positive)" : ins.type === "SELL" ? "var(--negative)" : "var(--text-muted)"),
                              color: ins.type === "BUY" ? "var(--positive)" : ins.type === "SELL" ? "var(--negative)" : "var(--text-secondary)",
                              fontWeight: 700,
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.5rem",
                              borderRadius: 22,
                              letterSpacing: "0.05em",
                            }}>
                              {ins.type}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'Spline Sans Mono', monospace", textAlign: "right" }}>
                            {fmtShares(ins.shares)}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'Spline Sans Mono', monospace", textAlign: "right" }}>
                            {ins.price != null ? `$${ins.price.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'Spline Sans Mono', monospace", textAlign: "right", color: ins.type === "BUY" ? "var(--positive)" : ins.type === "SELL" ? "var(--negative)" : "inherit" }}>
                            {fmtNum(ins.value)}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'Spline Sans Mono', monospace", textAlign: "right", color: "var(--text-secondary)" }}>
                            {ins.owned != null ? fmtShares(ins.owned) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalInsiderPages > 1 && (
                  <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-elevated)" }}>
                    <button
                      onClick={() => setInsiderPage(p => Math.max(0, p - 1))}
                      disabled={insiderPage === 0}
                      style={{ padding: "0.35rem 0.75rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, color: "var(--text-primary)", cursor: insiderPage === 0 ? "not-allowed" : "pointer", opacity: insiderPage === 0 ? 0.4 : 1, fontSize: "0.8rem" }}
                    >
                      <Icon name="chevron-left" size={14} /> Prev
                    </button>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Page {insiderPage + 1} of {totalInsiderPages} · {insiders.length} total
                    </span>
                    <button
                      onClick={() => setInsiderPage(p => Math.min(totalInsiderPages - 1, p + 1))}
                      disabled={insiderPage === totalInsiderPages - 1}
                      style={{ padding: "0.35rem 0.75rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, color: "var(--text-primary)", cursor: insiderPage === totalInsiderPages - 1 ? "not-allowed" : "pointer", opacity: insiderPage === totalInsiderPages - 1 ? 0.4 : 1, fontSize: "0.8rem" }}
                    >
                      Next <Icon name="chevron-right" size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SecFilingsPage() {
  return <Suspense fallback={null}><SecInner /></Suspense>;
}
