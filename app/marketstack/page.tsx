"use client";
import { useState, Suspense } from "react";
import CompanyLogo from "@/components/CompanyLogo";

const CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 22,
};
const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";

const PICKS = ["AAPL", "NVDA", "KO", "SPY", "IREN", "JNJ"];

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
        fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)",
        borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
        margin: "1.9rem 0 0.9rem",
      }}
    >
      <span>{children}</span>
      {hint && (
        <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.62rem" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : "var(--text-primary)";
  return (
    <div style={{ ...CARD, padding: "13px 16px" }}>
      <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: "1.15rem", fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));

/** Inline sparkline — avoids pulling a chart lib into an evaluation page. */
function Sparkline({ series, up }: { series: { d: string; c: number }[]; up: boolean }) {
  if (series.length < 2) return null;
  const W = 1000, H = 200, PAD = 4;
  const vals = series.map((p) => p.c);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const stroke = up ? "var(--positive)" : "var(--negative)";
  const gid = up ? "msUp" : "msDown";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 200, display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MarketStackInner() {
  const [input, setInput] = useState("AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t); setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/marketstack-lookup/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch");
    } finally { setLoading(false); }
  }

  const p = data?.price;
  const prof = data?.profile;
  const div = data?.dividends;
  const up = (p?.periodReturnPct ?? 0) >= 0;

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Marketstack Explorer
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
        Everything the <strong>free tier</strong> exposes, in one view — company profile, prices, full dividend and split history.
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "1.4rem" }}>
        Each new ticker spends 4 of the 100 monthly requests; results cache 24h so repeats are free.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); search(); }} style={{ display: "flex", gap: 10, maxWidth: 380, marginBottom: "0.7rem" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g. AAPL)"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }}
        />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Search"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.6rem" }}>
        {PICKS.map((t) => (
          <button key={t} type="button" onClick={() => search(t)}
            style={{
              background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)",
              color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)",
              border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px",
              fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer",
            }}>{t}</button>
        ))}
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "0.85rem" }}>❌ {error}</p>}

      {data && p && (
        <>
          {/* ── Header ── */}
          <div style={{ ...CARD, padding: "20px 24px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <CompanyLogo ticker={data.ticker} size={54} />
            <div style={{ minWidth: 180 }}>
              <div style={{ fontFamily: SERIF, fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
                {prof?.name ?? data.ticker}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 3 }}>
                <span style={{ fontFamily: MONO }}>{data.ticker}</span>
                {prof?.sector && <> · {prof.sector}</>}
                {prof?.industry && <> · {prof.industry}</>}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontFamily: MONO, fontSize: "1.9rem", fontWeight: 700 }}>{money(p.latest)}</div>
              <div style={{ fontFamily: MONO, fontSize: "0.72rem", color: p.dayChangePct >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {p.dayChangePct != null ? pct(p.dayChangePct) : "—"} <span style={{ color: "var(--text-muted)" }}>· {p.latestDate}</span>
              </div>
            </div>
          </div>

          {/* ── Price chart ── */}
          <Label hint={`${p.oldestDate} → ${p.latestDate}`}>Price History</Label>
          <div style={{ ...CARD, padding: "16px 8px 10px" }}>
            <Sparkline series={data.series} up={up} />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px 0", fontFamily: MONO, fontSize: "0.66rem", color: "var(--text-muted)" }}>
              <span>{p.oldestDate}</span>
              <span style={{ color: up ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
                {p.periodReturnPct != null ? pct(p.periodReturnPct) : ""} over period
              </span>
              <span>{p.latestDate}</span>
            </div>
          </div>

          {/* ── Price stats ── */}
          <Label>Price Stats</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10 }}>
            <Stat label="52-Week High" value={money(p.high52)} />
            <Stat label="52-Week Low" value={money(p.low52)} />
            <Stat label="Avg Volume" value={compact(p.avgVol)} sub="over available history" />
            <Stat label="Trading Days" value={String(p.rowCount)} sub={p.droppedZeroRows ? `${p.droppedZeroRows} $0 rows filtered` : "clean series"} />
          </div>

          {/* ── Company profile ── */}
          {prof && (
            <>
              <Label hint="free tier · /tickerinfo">Company Profile</Label>
              {prof.about && (
                <div style={{ ...CARD, padding: "16px 20px", fontSize: "0.82rem", lineHeight: 1.6, color: "var(--text-secondary)", marginBottom: 10 }}>
                  {prof.about}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10 }}>
                {prof.employees != null && <Stat label="Employees" value={compact(Number(prof.employees))} />}
                {prof.incorporation && <Stat label="Incorporated" value={String(prof.incorporation)} />}
                {prof.fiscalYearEnd && <Stat label="Fiscal Year End" value={String(prof.fiscalYearEnd)} />}
                {prof.itemType && <Stat label="Type" value={String(prof.itemType)} />}
              </div>
              {(prof.address || prof.website || prof.phone) && (
                <div style={{ ...CARD, padding: "14px 20px", marginTop: 10, fontSize: "0.76rem", lineHeight: 1.8, color: "var(--text-secondary)" }}>
                  {prof.address && <div>🏢 {prof.address}</div>}
                  {prof.phone && <div>📞 {prof.phone}</div>}
                  {prof.website && (
                    <div>
                      🔗 <a href={prof.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{prof.website}</a>
                    </div>
                  )}
                  {prof.listings?.length > 0 && (
                    <div style={{ color: "var(--text-muted)" }}>📈 Listed on: {prof.listings.join(", ")}</div>
                  )}
                  {prof.previousNames?.length > 0 && (
                    <div style={{ color: "var(--text-muted)" }}>
                      📝 Formerly: {prof.previousNames.map((n: any) => `${n.name} (${String(n.from).slice(0, 4)})`).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Executives ── */}
          {prof?.executives?.length > 0 && (
            <>
              <Label>Key Executives</Label>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <tbody>
                    {prof.executives.map((e: any, i: number) => (
                      <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "8px 16px", fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: "8px 16px", color: "var(--text-secondary)", fontSize: "0.74rem" }}>{e.role ?? "—"}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>
                          {e.salary ? `$${Number(e.salary).toLocaleString()}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Dividends ── */}
          <Label hint={div?.count ? `${div.count} records back to ${div.oldest} — NOT capped at 1yr` : undefined}>
            Dividend History
          </Label>
          {div?.count > 0 ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10, marginBottom: 10 }}>
                <Stat label="TTM Dividends" value={money(div.ttmTotal)} sub="trailing 12 months" />
                <Stat label="Yield" value={div.dividendYield != null ? `${div.dividendYield.toFixed(2)}%` : "—"} sub="TTM ÷ price" tone="good" />
                <Stat label="Frequency" value={div.freq === "q" ? "Quarterly" : div.freq ? String(div.freq) : "—"} />
                <Stat label="History Depth" value={`${div.count}`} sub={`since ${div.oldest}`} />
              </div>

              {div.upcoming?.length > 0 && (
                <div style={{ ...CARD, padding: "12px 18px", marginBottom: 10, borderLeft: "3px solid var(--accent-gold)" }}>
                  <span style={{ fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--accent-gold)" }}>
                    Upcoming
                  </span>
                  {div.upcoming.map((d: any) => (
                    <div key={d.date} style={{ fontFamily: MONO, fontSize: "0.8rem", marginTop: 4 }}>
                      {money(d.amount)} · ex-date {d.date}
                      {d.paymentDate && <span style={{ color: "var(--text-muted)" }}> · pays {d.paymentDate}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-Date</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Amount</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Declared</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.all.map((d: any) => (
                      <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 14px", color: "var(--text-secondary)" }}>{d.date}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{money(d.amount)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-muted)" }}>{d.declarationDate ?? "—"}</td>
                        <td style={{ padding: "6px 14px", textAlign: "right", color: "var(--text-muted)" }}>{d.paymentDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ ...CARD, padding: "14px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              No dividend history — this ticker doesn&apos;t pay one.
            </div>
          )}

          {/* ── Splits ── */}
          <Label hint="full history on free tier">Split History</Label>
          {data.splits?.length > 0 ? (
            <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", fontFamily: MONO }}>
                <tbody>
                  {data.splits.map((s: any, i: number) => (
                    <tr key={s.date} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                      <td style={{ padding: "8px 16px", color: "var(--text-secondary)" }}>{s.date}</td>
                      <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>{s.factor}-for-1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...CARD, padding: "14px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              No splits on record.
            </div>
          )}

          {/* ── Capability matrix ── */}
          <Label hint="what this API key actually unlocks">Free Tier Capabilities</Label>
          <div style={{ ...CARD, padding: "6px 0" }}>
            {Object.entries(data.capabilities ?? {}).map(([name, c]: any, i) => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "10px 18px", borderTop: i ? "1px solid var(--border)" : "none",
              }}>
                <span style={{ color: c.ok ? "var(--positive)" : "var(--negative)", fontWeight: 700, width: 16 }}>
                  {c.ok ? "✓" : "✗"}
                </span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, minWidth: 130 }}>{name}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: MONO }}>{c.note}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6 }}>
            Paid tiers add intraday and real-time quotes, index data, 15+ years of EOD history, and SEC/EDGAR
            endpoints. Dividends, splits, and company profiles already return full depth on the free plan.
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketStackPage() {
  return <Suspense fallback={null}><MarketStackInner /></Suspense>;
}
