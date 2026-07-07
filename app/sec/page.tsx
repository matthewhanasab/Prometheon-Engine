"use client";

import { useState } from "react";

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

const FORM_COLORS: Record<string, { bg: string; color: string }> = {
  "10-K": { bg: "rgba(201,168,76,0.15)",  color: "#C9A84C" },
  "10-Q": { bg: "rgba(59,130,246,0.15)",  color: "#60A5FA" },
  "8-K":  { bg: "rgba(100,116,139,0.2)",  color: "#B3A28C" },
  "4":    { bg: "rgba(34,197,94,0.15)",   color: "#7A9B4E" },
  "S-1":  { bg: "rgba(168,85,247,0.15)",  color: "#C084FC" },
  "DEF 14A": { bg: "rgba(249,115,22,0.15)", color: "#FB923C" },
};

function formBadge(form: string) {
  const style = FORM_COLORS[form] ?? { bg: "rgba(160,143,122,0.12)", color: "var(--text-secondary)" };
  return (
    <span style={{
      display: "inline-block",
      background: style.bg,
      color: style.color,
      fontWeight: 700,
      fontSize: "0.72rem",
      padding: "0.18rem 0.55rem",
      borderRadius: 4,
      fontFamily: "'IBM Plex Mono', monospace",
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

export default function SecFilingsPage() {
  const [inputTicker, setInputTicker] = useState("");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [filings, setFilings]   = useState<Filing[]>([]);
  const [insiders, setInsiders] = useState<Insider[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [insiderPage, setInsiderPage] = useState(0);

  const INSIDER_PAGE_SIZE = 15;

  function loadTicker() {
    const sym = inputTicker.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError(null);
    setInsiderPage(0);
    fetch(`/api/sec/${sym}`)
      .then(r => r.json())
      .then(d => {
        setFilings(d.filings  ?? []);
        setInsiders(d.insiders ?? []);
        setActiveTicker(sym);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load SEC data."); setLoading(false); });
  }

  const insiderSlice = insiders.slice(insiderPage * INSIDER_PAGE_SIZE, (insiderPage + 1) * INSIDER_PAGE_SIZE);
  const totalInsiderPages = Math.ceil(insiders.length / INSIDER_PAGE_SIZE);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
          SEC Filings
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
          EDGAR · Real-time regulatory filings
        </p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.75rem", alignItems: "center" }}>
        <input
          value={inputTicker}
          onChange={e => setInputTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && loadTicker()}
          placeholder="Ticker"
          style={{
            width: 200,
            padding: "0.5rem 0.75rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            fontFamily: "'IBM Plex Mono', monospace",
            outline: "none",
            letterSpacing: "0.04em",
          }}
        />
        <button
          onClick={loadTicker}
          disabled={loading}
          style={{
            padding: "10px 22px",
            background: "var(--accent-gold)",
            border: "none",
            borderRadius: 4,
            color: "#17120E",
            fontFamily: "Inter, sans-serif",
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Loading…" : "Load"}
        </button>
        {activeTicker && !loading && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: "1.1rem", color: "var(--accent-gold)", marginLeft: "0.5rem" }}>
            {activeTicker}
          </span>
        )}
      </div>

      {error && <div style={{ color: "var(--negative)", marginBottom: "1rem" }}>{error}</div>}

      {loading && (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          Loading SEC filings from EDGAR…
        </div>
      )}

      {!loading && activeTicker && (
        <>
          {/* Recent Filings */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.75rem" }}>
            <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Recent Filings</h2>
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
                      <tr key={i} style={{ transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(30,45,69,0.4)")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
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
                              style={{ color: "var(--accent-gold)", fontSize: "0.8rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                            >
                              View ↗
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
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Insider Transactions</h2>
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
                        <tr key={i} onMouseEnter={e => (e.currentTarget.style.background = "rgba(30,45,69,0.4)")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                          <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {ins.date}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: "nowrap" }}>{ins.name}</td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: "0.78rem" }}>{ins.title}</td>
                          <td style={tdStyle}>
                            <span style={{
                              display: "inline-block",
                              background: ins.type === "BUY" ? "rgba(34,197,94,0.15)" : ins.type === "SELL" ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.15)",
                              color: ins.type === "BUY" ? "var(--positive)" : ins.type === "SELL" ? "var(--negative)" : "var(--text-secondary)",
                              fontWeight: 700,
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.5rem",
                              borderRadius: 4,
                              letterSpacing: "0.05em",
                            }}>
                              {ins.type}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right" }}>
                            {fmtShares(ins.shares)}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right" }}>
                            {ins.price != null ? `$${ins.price.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right", color: ins.type === "BUY" ? "var(--positive)" : ins.type === "SELL" ? "var(--negative)" : "inherit" }}>
                            {fmtNum(ins.value)}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right", color: "var(--text-secondary)" }}>
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
                      style={{ padding: "0.35rem 0.75rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", cursor: insiderPage === 0 ? "not-allowed" : "pointer", opacity: insiderPage === 0 ? 0.4 : 1, fontSize: "0.8rem" }}
                    >
                      ← Prev
                    </button>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Page {insiderPage + 1} of {totalInsiderPages} · {insiders.length} total
                    </span>
                    <button
                      onClick={() => setInsiderPage(p => Math.min(totalInsiderPages - 1, p + 1))}
                      disabled={insiderPage === totalInsiderPages - 1}
                      style={{ padding: "0.35rem 0.75rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", cursor: insiderPage === totalInsiderPages - 1 ? "not-allowed" : "pointer", opacity: insiderPage === totalInsiderPages - 1 ? 0.4 : 1, fontSize: "0.8rem" }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
