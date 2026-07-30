"use client";
import { useState, Suspense } from "react";

const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

const MONO = "'Spline Sans Mono', monospace";

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "1.8rem 0 0.9rem",
    }}>
      <span>{children}</span>{right}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "warn" ? "var(--accent-gold)" : "var(--text-primary)";
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.56rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "1.2rem", fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const PICKS = ["AAPL", "SPY", "IREN", "NVDA", "KO"];

function DataTestInner() {
  const [input, setInput] = useState("AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t); setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/datatest/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally { setLoading(false); }
  }

  const s = data?.summary;
  const ms = data?.marketstack;
  // Two independent quality axes: do the prices agree, and are any days missing?
  const priceVerdict = s && s.maxDiffPct != null
    ? s.maxDiffPct < 0.1 ? { text: "Prices match FMP", tone: "good" as const }
      : s.maxDiffPct < 1 ? { text: "Minor price differences", tone: "warn" as const }
      : { text: "Prices disagree — investigate", tone: "bad" as const }
    : null;
  const gapVerdict = s
    ? s.zeroPriceRows === 0 ? { text: "no missing days", tone: "good" as const }
      : { text: `${s.zeroPriceRows} day${s.zeroPriceRows === 1 ? "" : "s"} returned $0 — needs a sanity filter`, tone: "warn" as const }
    : null;

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Data Source Test
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
        Compares <strong>marketstack</strong> (commercial-use licensed) against <strong>FMP</strong> (personal-use only) on identical tickers.
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "1.4rem" }}>
        Internal evaluation tool. The free marketstack tier allows 100 requests/month, so results are cached 24h and only fetched on demand.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "flex", gap: 10, maxWidth: 380, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading} style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Testing…" : "Compare"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.6rem" }}>
        {PICKS.map((t) => (
          <button key={t} type="button" onClick={() => run(t)} style={{
            background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)",
            color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)",
            border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px",
            fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer",
          }}>{t}</button>
        ))}
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</p>}

      {data && s && (
        <>
          {priceVerdict && (
            <div style={{
              ...CARD, padding: "14px 18px", marginBottom: "0.4rem",
              borderLeft: `3px solid ${priceVerdict.tone === "good" ? "var(--positive)" : priceVerdict.tone === "bad" ? "var(--negative)" : "var(--accent-gold)"}`,
            }}>
              <div>
                <span style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.05rem", fontWeight: 600 }}>{priceVerdict.text}</span>
                <span style={{ fontFamily: MONO, fontSize: "0.78rem", color: "var(--text-secondary)", marginLeft: 12 }}>
                  max diff {s.maxDiffPct?.toFixed(4)}% · avg {s.avgDiffPct?.toFixed(4)}%
                </span>
              </div>
              {gapVerdict && (
                <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.74rem", marginTop: 5, color: gapVerdict.tone === "good" ? "var(--positive)" : "var(--accent-gold)" }}>
                  Coverage: {gapVerdict.text}
                  {s.zeroPriceDates?.length > 0 && (
                    <span style={{ fontFamily: MONO, color: "var(--text-muted)", marginLeft: 8 }}>({s.zeroPriceDates.join(", ")})</span>
                  )}
                </div>
              )}
            </div>
          )}

          <Label>Marketstack Metadata</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 44vw), 1fr))", gap: 10 }}>
            <Stat label="Company Name" value={ms?.meta?.name ?? "—"} />
            <Stat label="Exchange" value={ms?.meta?.exchange ?? "—"} sub={ms?.meta?.currency ?? undefined} />
            <Stat label="Asset Type" value={ms?.meta?.assetType ?? "—"} sub="ETF detection works" />
            <Stat label="History Available" value={s.msHistoryDepth != null ? `${s.msHistoryDepth} rows` : "—"} sub="free tier caps at ~1 year" />
          </div>

          <Label>Price Agreement vs FMP</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 44vw), 1fr))", gap: 10 }}>
            <Stat label="Latest Close (MS)" value={s.msLatest?.close != null ? `$${Number(s.msLatest.close).toFixed(2)}` : "—"} sub={s.msLatest?.date} />
            <Stat label="Latest Close (FMP)" value={s.fmpLatest?.close != null ? `$${Number(s.fmpLatest.close).toFixed(2)}` : "—"} sub={s.fmpLatest?.date} />
            <Stat label="Dates Compared" value={String(s.matchedDates)} sub={`${s.msRowCount} MS rows vs ${s.fmpRowCount} FMP rows`} />
            <Stat label="Missing Days ($0)" value={String(s.zeroPriceRows ?? 0)}
              sub={s.zeroPriceRows ? "excluded from diff math" : "clean series"}
              tone={s.zeroPriceRows ? "warn" : "good"} />
            <Stat label="Exact Matches" value={s.matchedDates ? `${((s.exactMatches / s.matchedDates) * 100).toFixed(1)}%` : "—"}
              sub={`${s.exactMatches} of ${s.matchedDates} within 0.005%`}
              tone={s.matchedDates && s.exactMatches / s.matchedDates > 0.95 ? "good" : "warn"} />
            <Stat label="Max Difference" value={s.maxDiffPct != null ? `${s.maxDiffPct.toFixed(4)}%` : "—"}
              tone={s.maxDiffPct != null ? (s.maxDiffPct < 0.1 ? "good" : s.maxDiffPct < 1 ? "warn" : "bad") : undefined} />
            <Stat label="Corporate Actions" value={`${s.dividendsFound} div · ${s.splitsFound} split`} sub="inline in EOD rows" />
          </div>

          <Label>Row-by-Row (most recent 60 trading days)</Label>
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", fontFamily: MONO }}>
              <thead>
                <tr style={{ color: "var(--text-secondary)", fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600 }}>Marketstack</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600 }}>FMP</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600 }}>Diff %</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Div / Split</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => {
                  const bad = r.diffPct != null && Math.abs(r.diffPct) >= 1;
                  const warn = r.diffPct != null && Math.abs(r.diffPct) >= 0.1 && !bad;
                  return (
                    <tr key={r.date} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 14px", color: "var(--text-secondary)" }}>{r.date}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right" }}>{r.ms != null ? `$${Number(r.ms).toFixed(2)}` : "—"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: r.fmp == null ? "var(--text-muted)" : undefined }}>
                        {r.fmp != null ? `$${Number(r.fmp).toFixed(2)}` : "no data"}
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: bad ? "var(--negative)" : warn ? "var(--accent-gold)" : "var(--positive)" }}>
                        {r.diffPct != null ? `${r.diffPct >= 0 ? "+" : ""}${r.diffPct.toFixed(4)}%` : "—"}
                      </td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--text-muted)" }}>
                        {(r.dividend ?? 0) > 0 ? `$${r.dividend}` : ""}{(r.split ?? 1) !== 1 ? ` ${r.split}:1` : ""}
                        {(r.dividend ?? 0) === 0 && (r.split ?? 1) === 1 ? "—" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 8 }}>
            Green under 0.1% · gold 0.1–1% · red over 1%. Small gaps are usually dividend-adjustment timing rather than bad data.
          </div>
        </>
      )}
    </div>
  );
}

export default function DataTestPage() {
  return <Suspense fallback={null}><DataTestInner /></Suspense>;
}
