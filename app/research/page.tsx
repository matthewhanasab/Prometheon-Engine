"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";
import TradingViewChart from "@/components/TradingViewChart";
import PriceChart from "@/components/PriceChart";
import ChartModeToggle, { ChartMode } from "@/components/ChartModeToggle";
import RangeToggle, { RangeKey, sliceRange } from "@/components/RangeToggle";
import ShareCardButton from "@/components/ShareCardButton";

import TradingViewWidget, { tvSymbol } from "@/components/TradingViewWidget";

// Stock Research, rebuilt on marketstack data end-to-end. Same visual language
// as /research, but every number here comes from the marketstack Business plan
// (plus TradingView's own widget for the interactive chart).

const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
// Loaded when no ?ticker= is given, so /research opens on a worked example.
const DEFAULT_TICKER = "AAPL";

type Holder = { name: string; shares: number };
type OwnershipPayload = {
  cusip?: string;
  found: boolean;
  quarter?: string;
  reason?: string;
  shares?: number;
  filers?: number;
  top?: Holder[];
};
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "N/A" : `$${fmt(n)}`);
const pct = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
// Trillions matter here: a $1.3T market cap rendered in billions reads
// "1306.9B", which no one parses at a glance. Negatives are handled too —
// net cash positions come through as negative net debt.
const compact = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "N/A";
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e12) return `${s}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${Math.round(a)}`;
};

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "2rem 0 0.9rem",
    }}>
      <span>{children}</span>{right}
    </div>
  );
}

function MCard({ label, value, sub, tone = "default", na = false, loading = false }: {
  label: string; value?: string; sub?: string; tone?: "good" | "bad" | "neutral" | "default"; na?: boolean;
  loading?: boolean;
}) {
  const color = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : "var(--text-primary)";
  return (
    <div style={{ ...CARD, padding: "14px 16px", opacity: na ? 0.6 : 1 }}>
      <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 5 }}>{label}</div>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="spinner" style={{ width: 13, height: 13 }} />
          <span style={{ fontFamily: SANS, fontSize: "0.72rem", color: "var(--text-muted)" }}>Loading…</span>
        </div>
      ) : na ? (
        <div style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-gold)", lineHeight: 1.35 }}>
          Not available with current data
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: "1.15rem", fontWeight: 600, color }}>{value}</div>
      )}
      {sub && <div style={{ fontFamily: SANS, fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/** Whole-section placeholder, so the layout still mirrors /research. */
function NASection({ reason }: { reason: string }) {
  return (
    <div style={{ ...CARD, padding: "18px 20px", opacity: 0.6, borderStyle: "dashed" }}>
      <div style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 4 }}>
        Not available with current data
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{reason}</div>
    </div>
  );
}

function Grid({ cols = 5, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(150px, 44vw), 1fr))`, gap: 10 }}>
      {children}
    </div>
  );
}

// ── Benchmark rows ─────────────────────────────────────────────────────────
// Label on the left, the figure in the middle, and — the part that makes the
// number mean something — a typical range on the right, so you can tell a
// 396× P/E from a 22× one without knowing the norms by heart.

type Bench = {
  label: string;
  value: string;
  /** Typical range, e.g. [20, 28]. Omit when a metric has no meaningful norm. */
  range?: [number, number];
  /** Raw figure used to grade against `range`. */
  raw?: number | null;
  /** true when a higher figure is better (margins, growth); false for multiples. */
  higherBetter?: boolean;
  /** Overrides the auto-generated benchmark text. */
  note?: string;
  unit?: "x" | "%" | "";
  na?: boolean;
  naReason?: string;
  /** Waiting on a slower secondary request — NOT the same as unavailable. */
  loading?: boolean;
};

const ACCENTS: Record<string, string> = {
  valuation: "var(--accent-gold)",
  growth: "#3B82F6",
  margins: "#22C55E",
  health: "#A78BFA",
};

function benchText(b: Bench): string {
  if (b.note) return b.note;
  if (!b.range) return "";
  const [lo, hi] = b.range;
  const f = (n: number) => (b.unit === "%" ? `${n}%` : b.unit === "x" ? `${n}` : `${n}`);
  return `Many stocks land at ${f(lo)}–${f(hi)}${b.unit === "x" ? "×" : ""}`;
}

/** Grade a figure against its typical range: better / typical / worse. */
function grade(b: Bench): "good" | "mid" | "bad" | null {
  if (b.raw == null || !Number.isFinite(b.raw) || !b.range) return null;
  const [lo, hi] = b.range;
  const higher = b.higherBetter ?? false;
  if (b.raw >= lo && b.raw <= hi) return "mid";
  if (higher) return b.raw > hi ? "good" : "bad";
  return b.raw < lo ? "good" : "bad";
}

function BenchRow({ b, accent }: { b: Bench; accent: string }) {
  const g = grade(b);
  const valueColor = b.na || b.loading
    ? "var(--accent-gold)"
    : g === "good" ? "var(--positive)"
    : g === "bad" ? "var(--negative)"
    : "var(--text-primary)";
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(140px, 1.15fr) minmax(80px, 0.75fr) minmax(150px, 1.5fr)",
      alignItems: "center", gap: 14,
      padding: "9px 14px",
      borderBottom: "1px solid var(--border)",
    }}>
      {/* label pill */}
      <div style={{
        fontFamily: SANS, fontSize: "0.63rem", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.09em",
        color: "var(--text-primary)",
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: "6px",
        padding: "7px 11px",
      }}>
        {b.label}
      </div>

      {/* figure */}
      <div style={{
        fontFamily: MONO, fontSize: b.na || b.loading ? "0.66rem" : "1.05rem", fontWeight: 700,
        color: valueColor, textAlign: "right", lineHeight: 1.25,
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7,
      }}>
        {b.loading ? (
          <>
            <span className="spinner" style={{ width: 11, height: 11 }} />
            <span style={{ color: "var(--text-muted)" }}>Loading</span>
          </>
        ) : b.na ? "Not available" : b.value}
      </div>

      {/* benchmark */}
      <div style={{
        fontFamily: SANS, fontSize: "0.63rem", fontWeight: 500,
        textTransform: "uppercase", letterSpacing: "0.07em",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border)", paddingBottom: 4,
      }}>
        {b.loading ? "Fetching analyst consensus" : b.na ? (b.naReason ?? "Needs analyst estimates") : benchText(b)}
      </div>
    </div>
  );
}

function BenchGroup({ rows, accent }: { rows: Bench[]; accent: string }) {
  return (
    <div style={{ ...CARD, padding: "2px 0", marginBottom: 10, overflowX: "auto" }}>
      {rows.map((b) => <BenchRow key={b.label} b={b} accent={accent} />)}
    </div>
  );
}

// ── Skeleton preview shown before a ticker is entered ──────────────────────
// Mirrors the real page's top layout so visitors see the shape of what they'll
// get. Dimmed placeholder cards, no data.
function SkCard({ label }: { label: string }) {
  return (
    <div style={{ ...CARD, padding: "14px 16px", opacity: 0.55 }}>
      <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 8 }}>{label}</div>
      <div style={{ height: 15, width: "62%", borderRadius: 6, background: "var(--bg-elevated)" }} />
      <div style={{ height: 8, width: "40%", borderRadius: 6, background: "var(--bg-elevated)", marginTop: 8, opacity: 0.7 }} />
    </div>
  );
}

function EmptyPreview() {
  const skGrid = (labels: string[]) => (
    <Grid cols={5}>{labels.map((l) => <SkCard key={l} label={l} />)}</Grid>
  );
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <SectionLabel>Price Chart</SectionLabel>
      <div style={{ ...CARD, height: 300, opacity: 0.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Enter a ticker to load the interactive price chart
        </span>
      </div>

      <SectionLabel>Quick Stats</SectionLabel>
      {skGrid(["52-Wk High", "52-Wk Low", "52-Wk Position", "Beta", "Analyst Target"])}

      <SectionLabel>Long-Term Performance</SectionLabel>
      {skGrid(["1-Year Return", "3-Year Return", "5-Year Return", "10-Year Return", "15-Year Return"])}

      <SectionLabel>Mandatory Metrics</SectionLabel>
      {skGrid(["TTM P/E Ratio", "Forward P/E", "Fwd EPS Growth", "Revenue Growth", "Total Revenue"])}
      <div style={{ height: 8 }} />
      {skGrid(["Gross Margin", "Operating Margin", "Net Margin", "Price / Sales", "EPS (TTM)"])}

      <SectionLabel>Advanced Metrics</SectionLabel>
      {skGrid(["PEG Ratio", "Return on Equity", "Price / Book", "Price / FCF", "FCF Yield"])}

      <SectionLabel>Quality &amp; Fair Value</SectionLabel>
      {skGrid(["Piotroski F-Score", "Altman Z-Score", "DCF Fair Value"])}
    </div>
  );
}

const pctOf = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${(n * 100).toFixed(d)}%`;
const mult = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${n.toFixed(2)}×`;

type Tone = "good" | "bad" | "neutral" | "default";
const peTone = (pe: number | null): [string, Tone] =>
  pe == null ? ["No data", "default"] : pe < 15 ? ["Value territory", "good"]
    : pe < 25 ? ["Reasonable multiple", "neutral"] : ["Growth premium priced in", "bad"];
const marginTone = (m: number | null, kind: "gross" | "operating" | "net"): [string, Tone] => {
  if (m == null) return ["No data", "default"];
  const hi = kind === "gross" ? 0.4 : kind === "operating" ? 0.2 : 0.15;
  const lo = kind === "gross" ? 0.2 : kind === "operating" ? 0.08 : 0.05;
  return m > hi ? [kind === "gross" ? "Solid gross margin" : kind === "operating" ? "Strong operating leverage" : "Highly profitable", "good"]
    : m > lo ? ["Moderate margin", "neutral"] : ["Thin margin", "bad"];
};
const roeTone = (r: number | null): [string, Tone] =>
  r == null ? ["No data", "default"] : r > 0.2 ? ["Exceptional capital returns", "good"]
    : r > 0.1 ? ["Healthy returns", "neutral"] : r > 0 ? ["Low returns", "bad"] : ["Negative returns", "bad"];
const deTone = (d: number | null): [string, Tone] =>
  d == null ? ["No data", "default"] : d < 0.5 ? ["Conservative leverage", "good"]
    : d < 1.5 ? ["Moderate leverage", "neutral"] : ["High leverage", "bad"];

function ratingTone(r: string | null): string {
  if (!r) return "var(--text-secondary)";
  const s = r.toLowerCase();
  if (s.includes("buy") || s.includes("outperform") || s.includes("overweight")) return "var(--positive)";
  if (s.includes("sell") || s.includes("underperform") || s.includes("underweight")) return "var(--negative)";
  return "var(--accent-gold)";
}

function MarketstackResearchInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  // ETF ownership scans a couple of dozen funds' full portfolios, so it's
  // fetched separately once the main payload has landed — it never delays the
  // page. null = still loading, [] = genuinely held by none of them.
  const [etfHolders, setEtfHolders] = useState<any>(null);
  // Analyst ratings and consensus estimates are the two slowest upstream calls
  // in the stack (~3.8s and ~2.2s cold, measured), and nothing above the fold
  // needs them — so they load after the main payload instead of holding it up.
  const [analystData, setAnalystData] = useState<any>(null);
  // 13F institutional ownership, keyed by CUSIP off the ISIN marketstack gives
  // us. Loaded after the main payload like the other secondary panels.
  const [ownership, setOwnership] = useState<OwnershipPayload | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("builtin");
  const loadedOnce = useRef(false);

  async function load(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t); setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/marketstack-stock/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch"); setData(null);
    } finally { setLoading(false); }
  }

  // A bare visit opens on a default ticker rather than the empty skeleton, so
  // the page shows what it does without the visitor having to type first. Being
  // the default keeps it hot in the edge cache, so it costs a cache hit.
  // EmptyPreview still covers the gap until the payload lands.
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    load(search.get("ticker") ?? DEFAULT_TICKER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived rather than reset inside the effect: tagging the payload with the
  // CUSIP it came from means a ticker change reads as "not ready yet" without a
  // synchronous setState, and stale numbers can't flash on the next company.
  const cusip = (() => {
    const isin: string | undefined = data?.meta?.isin;
    return isin && /^US[0-9A-Z]{9}\d$/.test(isin) ? isin.slice(2, 11) : null;
  })();
  const ownershipReady = cusip != null && ownership?.cusip === cusip ? ownership : null;

  useEffect(() => {
    if (!cusip) return;
    let alive = true;
    fetch(`/api/ownership/${cusip}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setOwnership({ ...j, cusip }); })
      .catch(() => { if (alive) setOwnership({ found: false, cusip }); });
    return () => { alive = false; };
  }, [cusip]);

  useEffect(() => {
    const tk = data?.ticker;
    if (!tk) { setAnalystData(null); return; }
    let alive = true;
    setAnalystData(null);
    fetch(`/api/stock-analysts/${tk}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setAnalystData(j); })
      .catch(() => { if (alive) setAnalystData({ consensus: null, consensusForward: null }); });
    return () => { alive = false; };
  }, [data?.ticker]);

  // Kick the ETF scan off after the main payload resolves, passing the company
  // name we already have so the endpoint skips its own lookup.
  useEffect(() => {
    const t = data?.ticker;
    if (!t) { setEtfHolders(null); return; }
    let alive = true;
    setEtfHolders(null);
    const nm = data?.profile?.name ? `?name=${encodeURIComponent(data.profile.name)}` : "";
    fetch(`/api/stock-etfs/${t}${nm}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setEtfHolders(Array.isArray(j?.matches) ? j : { matches: [], failed: true }); })
      .catch(() => { if (alive) setEtfHolders({ matches: [], failed: true }); });
    return () => { alive = false; };
  }, [data?.ticker, data?.profile?.name]);

  const q = data?.quote;
  const prof = data?.profile;
  const cons = analystData?.consensus;
  const fwd = data?.forward;
  const fwdRev = data?.forwardRevenue;
  // Analyst consensus, kept distinct from `fwd` — that one is our own trend
  // projection off filed results, this is what the covering analysts publish.
  const cf = analystData?.consensusForward;
  // Analyst ratings and consensus load after the main payload, so a row that
  // depends on them is "not here yet" during that window — not "not available".
  // Conflating the two told visitors a metric didn't exist when it was seconds
  // from arriving.
  const analystsPending = analystData == null;
  const div = data?.dividends;
  const fun = data?.fundamentals;
  const capm = data?.capm;
  const priceSeries: { date: string; price: number }[] = data?.price ?? [];
  const chartWindow = sliceRange<{ date: string; price: number }>(priceSeries, range);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Stock Research
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Type in a ticker to get started — valuation, growth, quality, analyst ratings, dividends,
        and SEC filings fill in automatically.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: "flex", gap: 10, maxWidth: 380, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Type a ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Analyze"}
        </button>
      </form>

      {/* A one-line "Loading AAPL…" left the rest of the page blank for the
          seconds an uncached ticker takes, which reads as nothing happening.
          The skeleton mirrors the real layout — header, chart, then the metric
          grids — so the shape of what's coming is visible while it loads. */}
      {loading && (
        <div style={{ marginTop: "0.5rem" }}>
          <div style={{
            ...CARD, borderColor: "var(--border-active)", display: "flex", alignItems: "center",
            gap: 14, padding: "16px 18px", marginBottom: 16,
          }}>
            <span className="spinner" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-gold)" }}>
                Analyzing {input}…
              </div>
              <div style={{ fontFamily: SANS, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>
                Pulling prices, SEC filings and fundamentals. First load for a ticker takes a few
                seconds; after that it&rsquo;s instant.
              </div>
            </div>
          </div>

          <div style={{ ...CARD, padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="skeleton-bar" style={{ width: 58, height: 58, borderRadius: 14, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="skeleton-bar" style={{ height: 20, width: "38%" }} />
                <div className="skeleton-bar skeleton-d1" style={{ height: 13, width: "22%" }} />
              </div>
            </div>
          </div>

          <SectionLabel>Price Chart</SectionLabel>
          <div className="skeleton-bar" style={{ ...CARD, height: 300, marginBottom: 4 }} />

          {["Quick Stats", "Mandatory Metrics", "Advanced Metrics"].map((label, gi) => (
            <div key={label}>
              <SectionLabel>{label}</SectionLabel>
              <Grid cols={5}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ ...CARD, padding: "14px 16px" }}>
                    <div className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height: 9, width: "58%" }} />
                    <div className={`skeleton-bar skeleton-d${((i + gi) % 3) + 1}`} style={{ height: 17, width: "44%", marginTop: 10 }} />
                  </div>
                ))}
              </Grid>
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {!data && !loading && !error && <EmptyPreview />}

      {data && q && !loading && (
        <>
          {/* ── Company Header ── */}
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1.5rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
              <CompanyLogo ticker={data.ticker} size={58} />
              <div style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 500 }}>{prof?.name ?? data.ticker}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", marginRight: 2 }}>Peers</span>
              <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--accent-gold)", background: "var(--bg-elevated)", border: "1px dashed var(--border)", borderRadius: 999, padding: "3px 9px" }}>
                Not available with current data
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>no screener endpoint to rank industry peers by market cap</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: "2.4rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{money(q.price)}</span>
              <span style={{ fontFamily: MONO, fontSize: "1rem", fontWeight: 500, color: (q.change ?? 0) >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {(q.change ?? 0) >= 0 ? "▲" : "▼"} ${Math.abs(q.change ?? 0).toFixed(2)} ({pct(q.changePct)})
              </span>
              {fun?.marketCap != null && (
                <span style={{ fontFamily: SANS, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Mkt cap <strong style={{ fontFamily: MONO, color: "var(--text-primary)" }}>{compact(fun.marketCap)}</strong>
                </span>
              )}
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>as of {q.date}</span>
              <span style={{ marginLeft: "auto", alignSelf: "center" }}>
                <ShareCardButton
                  stock={{
                    ticker: data.ticker,
                    name: prof?.name ?? data.ticker,
                    sector: prof?.sector ?? null,
                    price: q.price,
                    change: q.change,
                    changePct: q.changePct,
                    mktCap: fun?.marketCap ?? null,
                    week52High: q.week52High,
                    week52Low: q.week52Low,
                    peRatio: fun?.peRatio ?? null,
                    analystTarget: cons?.avgTarget ?? null,
                  }}
                  window={chartWindow}
                  rangeLabel={range}
                />
              </span>
            </div>
          </div>

          {/* ── Price Chart ── */}
          <SectionLabel right={
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* TradingView ships its own timeframe controls */}
              {chartMode === "builtin" && <RangeToggle range={range} onChange={setRange} />}
              <ChartModeToggle mode={chartMode} onChange={setChartMode} />
            </div>
          }>Price Chart</SectionLabel>
          {chartMode === "builtin"
            ? <PriceChart data={chartWindow} label={range} />
            : <TradingViewChart ticker={data.ticker} />}

          {/* ── Quick Stats ── */}
          <SectionLabel>Quick Stats</SectionLabel>
          <Grid cols={5}>
            <MCard label="52-Wk High" value={money(q.week52High)} />
            <MCard label="52-Wk Low" value={money(q.week52Low)} />
            <MCard label="52-Wk Position" value={q.pos52 != null ? `${q.pos52.toFixed(0)}%` : "N/A"}
              sub={q.pos52 != null ? (q.pos52 > 70 ? "Near 52-wk high" : q.pos52 < 30 ? "Near 52-wk low" : "Mid-range") : undefined} />
            <MCard label="Beta" value={capm?.beta != null ? capm.beta.toFixed(2) : "N/A"}
              sub={capm?.beta == null ? "Insufficient overlap" : capm.beta > 1.3 ? "High volatility" : capm.beta < 0.8 ? "Low volatility" : "Market-like beta"} />
            <MCard label="Analyst Target" loading={analystsPending}
              value={cons?.avgTarget != null ? money(cons.avgTarget) : "N/A"}
              sub={cons?.avgTarget != null && q.price ? `${pct(((cons.avgTarget - q.price) / q.price) * 100, 1)} upside` : undefined}
              tone={cons?.avgTarget != null && cons.avgTarget > q.price ? "good" : "default"} />
          </Grid>

          {/* ── Long-Term Performance ── */}
          <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>the 15-year history entitlement, live</span>}>
            Long-Term Performance
          </SectionLabel>
          <Grid cols={5}>
            {data.longReturns?.map((r: any) =>
              r.available ? (
                <MCard key={r.years} label={`${r.years}-Year Return`} value={pct(r.totalPct, 0)}
                  sub={`${pct(r.cagrPct, 1)}/yr · from ${money(r.fromPrice)} (${String(r.fromDate).slice(0, 4)})`}
                  tone={r.totalPct >= 0 ? "good" : "bad"} />
              ) : (
                <MCard key={r.years} label={`${r.years}-Year Return`} value="—"
                  sub={r.listedFrom ? `listed ${String(r.listedFrom).slice(0, 4)}` : "not listed that long"} />
              )
            )}
          </Grid>

          {/* ── Mandatory Metrics (SEC EDGAR XBRL) ── */}
          {fun && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>SEC EDGAR · TTM through {fun.asOf}</span>}>
                Mandatory Metrics
              </SectionLabel>

              {/* Valuation multiples */}
              <BenchGroup accent={ACCENTS.valuation} rows={[
                { label: "TTM P/E", value: mult(fun.peRatio), raw: fun.peRatio, range: [20, 28], unit: "x" },
                cf?.pe != null
                  ? { label: "Forward P/E", value: mult(cf.pe), raw: cf.pe, range: [18, 26], unit: "x",
                      note: `Analyst consensus · next 12 months${cf.analysts ? ` · ${cf.analysts} estimates` : ""}` }
                  : analystsPending
                  ? { label: "Forward P/E", value: "", loading: true }
                  : { label: "Forward P/E", value: "", na: true },
                { label: "TTM P/S", value: mult(fun.ps), raw: fun.ps, range: [1.8, 2.6], unit: "x" },
                // Two bases, best first, each labelled so they can't be mistaken
                // for one another. Preferred: P/S = P/E x net margin, an
                // identity that holds at the forward date regardless of
                // buybacks, quoting real consensus EPS. It requires a positive
                // margin though, and breaks exactly where it'd be most useful —
                // a loss-maker's negative margin yields a negative P/S. So a
                // company still losing money falls back to its own projected
                // revenue, which keeps growing through losses.
                analystsPending && fun.netMargin != null && fun.netMargin > 0
                  ? { label: "Forward P/S", value: "", loading: true }
                  : cf?.pe != null && fun.netMargin != null && fun.netMargin > 0
                  ? { label: "Forward P/S", value: mult(cf.pe * fun.netMargin),
                      raw: cf.pe * fun.netMargin, range: [1.8, 2.6], unit: "x",
                      note: `Consensus EPS at today's ${pctOf(fun.netMargin, 1)} net margin` }
                  : fun.ps != null && fwdRev?.growth != null && fwdRev.growth > -1
                  ? { label: "Forward P/S", value: mult(fun.ps / (1 + fwdRev.growth)),
                      raw: fun.ps / (1 + fwdRev.growth), range: [1.8, 2.6], unit: "x",
                      note: `Projected from revenue trend — not consensus` }
                  : { label: "Forward P/S", value: "", na: true, naReason: "Needs revenue or a positive margin" },
                { label: "PEG Ratio", value: mult(fun.pegRatio), raw: fun.pegRatio, range: [1, 2], unit: "x",
                  note: fun.pegRatio == null ? "Needs positive EPS growth" : undefined },
              ]} />

              {/* Growth */}
              <BenchGroup accent={ACCENTS.growth} rows={[
                { label: "TTM EPS Growth", value: pctOf(fun.epsGrowth, 1),
                  raw: fun.epsGrowth != null ? fun.epsGrowth * 100 : null, range: [8, 12], unit: "%", higherBetter: true },
                analystsPending && cf?.nextYearEpsGrowth == null
                  ? { label: "Next Yr EPS Growth", value: "", loading: true }
                  : cf?.nextYearEpsGrowth != null
                  ? { label: "Next Yr EPS Growth", value: pctOf(cf.nextYearEpsGrowth, 1),
                      raw: cf.nextYearEpsGrowth * 100, range: [8, 12], unit: "%", higherBetter: true,
                      note: `Consensus ${cf.currentYearLabel} → ${cf.nextYearLabel}${cf.analysts ? ` · ${cf.analysts} estimates` : ""}` }
                  : { label: "Next Yr EPS Growth", value: "", na: true },
                { label: "TTM Rev Growth", value: pctOf(fun.revenueGrowth, 1),
                  raw: fun.revenueGrowth != null ? fun.revenueGrowth * 100 : null, range: [4.5, 6.5], unit: "%", higherBetter: true },
                // Not derived from EPS growth — buybacks and margin shifts drive
                // a wedge between the two, so equating them would be wrong
                // rather than rough. This is revenue's own trend carried
                // forward, and the note keeps it distinct from the consensus
                // figure on the EPS row directly above.
                fwdRev?.growth != null
                  ? { label: "Next Yr Rev Growth", value: pctOf(fwdRev.growth, 1),
                      raw: fwdRev.growth * 100, range: [4.5, 6.5], unit: "%", higherBetter: true,
                      note: `Projected from revenue trend · ${fwdRev.confidence} confidence — not consensus` }
                  : { label: "Next Yr Rev Growth", value: "", na: true, naReason: "No usable revenue history" },
                { label: "Total Revenue", value: compact(fun.revenue), note: "Trailing twelve months" },
              ]} />

              {/* Margins */}
              <BenchGroup accent={ACCENTS.margins} rows={[
                { label: "Gross Margin", value: pctOf(fun.grossMargin),
                  raw: fun.grossMargin != null ? fun.grossMargin * 100 : null, range: [40, 48], unit: "%", higherBetter: true },
                { label: "Operating Margin", value: pctOf(fun.operatingMargin),
                  raw: fun.operatingMargin != null ? fun.operatingMargin * 100 : null, range: [12, 18], unit: "%", higherBetter: true },
                { label: "Net Margin", value: pctOf(fun.netMargin),
                  raw: fun.netMargin != null ? fun.netMargin * 100 : null, range: [8, 10], unit: "%", higherBetter: true },
                { label: "EPS (TTM)", value: fun.eps != null ? money(fun.eps) : "N/A",
                  note: fun.epsGrowth != null ? `${pctOf(fun.epsGrowth, 1)} year over year` : "Diluted, trailing twelve months" },
              ]} />

              {/* ── Advanced Metrics ── */}
              <SectionLabel>Advanced Metrics</SectionLabel>

              <BenchGroup accent={ACCENTS.valuation} rows={[
                { label: "Return on Equity", value: pctOf(fun.roe),
                  raw: fun.roe != null ? fun.roe * 100 : null, range: [12, 18], unit: "%", higherBetter: true },
                { label: "Price / Book", value: mult(fun.pb), raw: fun.pb, range: [2, 4], unit: "x" },
                { label: "Price / FCF", value: mult(fun.pfcf), raw: fun.pfcf, range: [15, 25], unit: "x" },
                { label: "FCF Yield", value: pctOf(fun.fcfYield, 1),
                  raw: fun.fcfYield != null ? fun.fcfYield * 100 : null, range: [3, 6], unit: "%", higherBetter: true },
                { label: "Dividend Yield", value: div?.yieldPct != null ? `${div.yieldPct.toFixed(2)}%` : "N/A",
                  raw: div?.yieldPct ?? null, range: [1.5, 3], unit: "%", higherBetter: true,
                  note: div?.yieldPct == null ? "Pays no dividend" : undefined },
              ]} />

              <BenchGroup accent={ACCENTS.health} rows={[
                { label: "Debt / Equity", value: mult(fun.debtToEquity), raw: fun.debtToEquity, range: [0.5, 1.5], unit: "x" },
                { label: "Current Ratio", value: mult(fun.currentRatio),
                  raw: fun.currentRatio, range: [1.5, 3], unit: "x", higherBetter: true },
                { label: "Net Debt / Cash",
                  value: fun.netDebt == null ? "N/A" : `${compact(Math.abs(fun.netDebt))} ${fun.netDebt >= 0 ? "debt" : "cash"}`,
                  note: fun.longTermInvestments
                    ? `Excludes ${compact(fun.longTermInvestments)} long-term securities`
                    : `${compact(fun.cash)} cash + short-term investments` },
                { label: "Operating Cash Flow", value: compact(fun.ocf),
                  note: fun.capex != null ? `Less ${compact(fun.capex)} capital expenditure` : "Trailing twelve months" },
              ]} />

              {/* ── Quality & Fair Value ── */}
              <SectionLabel>Quality &amp; Fair Value</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 92vw), 1fr))", gap: 10 }}>
                <div style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>Piotroski F-Score</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", fontWeight: 700, color: fun.piotroski.score >= 7 ? "var(--positive)" : fun.piotroski.score >= 4 ? "var(--accent-gold)" : "var(--negative)" }}>
                    {fun.piotroski.score} / {fun.piotroski.outOf}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: 10 }}>{fun.piotroski.basis}</div>
                  <div style={{ display: "grid", gap: 3 }}>
                    {fun.piotroski.checks.map((c: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 8, fontSize: "0.68rem", alignItems: "baseline" }}>
                        <span style={{ width: 12, color: c.pass === true ? "var(--positive)" : c.pass === false ? "var(--negative)" : "var(--text-muted)", fontWeight: 700 }}>
                          {c.pass === true ? "✓" : c.pass === false ? "✗" : "–"}
                        </span>
                        <span style={{ color: c.pass === false ? "var(--text-secondary)" : "var(--text-primary)" }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>Altman Z-Score</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", fontWeight: 700, color: (fun.altmanZ ?? 0) > 2.99 ? "var(--positive)" : (fun.altmanZ ?? 0) > 1.81 ? "var(--accent-gold)" : "var(--negative)" }}>
                    {fun.altmanZ != null ? fun.altmanZ.toFixed(2) : "N/A"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 6 }}>
                    {fun.altmanZ == null ? "Insufficient data"
                      : fun.altmanZ > 2.99 ? "Safe zone — low bankruptcy risk"
                      : fun.altmanZ > 1.81 ? "Grey zone — some financial stress"
                      : "Distress zone — elevated risk"}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                    Weighted from working capital, retained earnings, operating income, market cap and revenue, all against total assets.
                  </div>
                </div>

                <div style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>DCF Fair Value</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", fontWeight: 700, color: fun.dcf && fun.dcf.perShare > q.price ? "var(--positive)" : "var(--negative)" }}>
                    {fun.dcf ? money(fun.dcf.perShare) : "N/A"}
                  </div>
                  {fun.dcf && (
                    <>
                      <div style={{ fontSize: "0.7rem", color: fun.dcf.perShare > q.price ? "var(--positive)" : "var(--negative)", marginTop: 6 }}>
                        {pct(((fun.dcf.perShare - q.price) / q.price) * 100, 1)} vs price
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                        Two-stage FCF model: {pctOf(fun.dcf.assumedGrowth, 1)} growth for 5y then half that,
                        {" "}{pctOf(fun.dcf.discount, 0)} discount, {pctOf(fun.dcf.terminal, 1)} terminal.
                        Assumption-driven — a reference point, not a target.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── CAPM ── */}
          {capm && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>
                beta from {capm.betaSamples} monthly returns vs SPY (5-year)
              </span>}>
                CAPM · Risk-Adjusted Return
              </SectionLabel>
              <Grid cols={5}>
                <MCard label="Risk-Free Rate (10Y)" value={`${(capm.rf * 100).toFixed(2)}%`} sub="FRED DGS10 · daily" />
                <MCard label="Beta (vs Market)" value={capm.beta != null ? capm.beta.toFixed(2) : "N/A"}
                  sub={capm.beta == null ? "Insufficient overlap" : capm.beta > 1 ? "More volatile than market" : "Less volatile than market"} />
                <MCard label="Equity Risk Premium" value={`${(capm.erp * 100).toFixed(2)}%`} sub={`Mkt 10% − Rf ${(capm.rf * 100).toFixed(2)}%`} />
                <MCard label="CAPM Expected Return" value={capm.expected != null ? `${(capm.expected * 100).toFixed(2)}%` : "N/A"} sub="Rf + β × ERP" tone="neutral" />
                <MCard label="Actual 1Y Return" value={capm.actual1Y != null ? pct(capm.actual1Y, 1) : "N/A"}
                  tone={capm.actual1Y == null ? "default" : capm.actual1Y >= 0 ? "good" : "bad"} />
              </Grid>
              {capm.expected != null && capm.actual1Y != null && (
                <>
                  <div style={{ height: 8 }} />
                  <Grid cols={5}>
                    <MCard label="Jensen's Alpha (1Y)"
                      value={pct(capm.actual1Y - capm.expected * 100, 2)}
                      sub={capm.actual1Y / 100 > capm.expected ? "Outperformed CAPM" : "Underperformed CAPM"}
                      tone={capm.actual1Y / 100 > capm.expected ? "good" : "bad"} />
                  </Grid>
                </>
              )}
            </>
          )}

          {/* ── Earnings History ── */}
          <SectionLabel>Earnings History</SectionLabel>
          <NASection reason="Marketstack has no earnings-surprise endpoint (reported vs estimate). Reported EPS is available from SEC filings, but the estimate side — which is what makes a surprise — is not." />

          {/* ── Analyst Ratings ── */}
          {cons && (
            <>
              <SectionLabel right={cons.asOf ? <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>as of {cons.asOf}</span> : undefined}>
                Analyst Ratings — {cons.analysts ?? "?"} Analysts
              </SectionLabel>
              <Grid cols={5}>
                <MCard label="Avg Target" value={money(cons.avgTarget)}
                  sub={q.price && cons.avgTarget != null ? `${pct(((cons.avgTarget - q.price) / q.price) * 100, 1)} implied` : undefined}
                  tone={cons.avgTarget != null && cons.avgTarget > q.price ? "good" : "bad"} />
                <MCard label="High Target" value={money(cons.highTarget)} tone="good" />
                <MCard label="Low Target" value={money(cons.lowTarget)} tone="bad" />
                <MCard label="Buy / Hold / Sell" value={`${cons.buy} / ${cons.hold} / ${cons.sell}`} />
                <MCard label="Consensus" value={
                  cons.buy + cons.hold + cons.sell > 0
                    ? cons.buy / (cons.buy + cons.hold + cons.sell) > 0.6 ? "Buy" : cons.sell > cons.buy ? "Sell" : "Hold"
                    : "N/A"
                } tone={cons.buy > cons.hold + cons.sell ? "good" : "neutral"} />
              </Grid>

              {/* buy/hold/sell bar */}
              {cons.buy + cons.hold + cons.sell > 0 && (
                <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", marginTop: 10, border: "1px solid var(--border)" }}>
                  <div style={{ width: `${(cons.buy / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--positive)" }} />
                  <div style={{ width: `${(cons.hold / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--accent-gold)" }} />
                  <div style={{ width: `${(cons.sell / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--negative)" }} />
                </div>
              )}

              {data.analysts?.length > 0 && (
                <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12, maxHeight: 380, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                    <thead>
                      <tr style={{ color: "var(--text-secondary)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Analyst</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Firm</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Rating</th>
                        <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Target</th>
                        <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.analysts.map((a: any, i: number) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "7px 14px", fontWeight: 600 }}>{a.name}</td>
                          <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{a.firm}</td>
                          <td style={{ padding: "7px 10px", color: ratingTone(a.rating), fontWeight: 600 }}>
                            {a.rating ?? "—"}{a.action ? <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.66rem" }}> · {a.action}</span> : null}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO }}>{a.target != null ? money(a.target) : "—"}</td>
                          <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{a.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Forward Outlook ── */}
          {fwd && (
            <>
              <SectionLabel right={
                <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>
                  projection · {fwd.confidence} confidence
                </span>
              }>Forward Outlook — Projected</SectionLabel>
              <Grid cols={5}>
                <MCard label="Fwd EPS (NTM)" value={money(fwd.eps)}
                  sub={q?.price && fun?.eps ? `from ${money(fun.eps)} TTM` : undefined} />
                <MCard label="Forward P/E" value={fwd.pe != null ? `${fwd.pe.toFixed(1)}×` : "N/A"}
                  sub={fwd.peCompressionPct != null ? `${pct(fwd.peCompressionPct, 1)} vs trailing` : undefined}
                  tone={fwd.pe != null && fun?.peRatio != null && fwd.pe < fun.peRatio ? "good" : "default"} />
                <MCard label="2-Yr Fwd EPS" value={money(fwd.eps2y)} />
                <MCard label="Applied Growth" value={pct(fwd.growth * 100, 1)}
                  tone={fwd.growth > 0 ? "good" : "bad"} />
                <MCard label="Forward PEG" value={fwd.peg != null ? fwd.peg.toFixed(2) : "N/A"}
                  sub={fwd.peg != null ? (fwd.peg < 1 ? "under 1 — cheap vs growth" : undefined) : undefined}
                  tone={fwd.peg != null && fwd.peg < 1.5 ? "good" : "default"} />
              </Grid>
              <div style={{ ...CARD, marginTop: 12, padding: "14px 16px", fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text-primary)" }}>This is a projection, not analyst consensus.</strong>{" "}
                No estimates feed exists in the current data stack, so these figures extrapolate {data.ticker}&apos;s
                own SEC-filed earnings trajectory forward: a weighted blend of{" "}
                {fwd.inputs.map((i: any, n: number) => (
                  <span key={i.label}>
                    {n > 0 ? ", " : ""}
                    <span style={{ fontFamily: MONO, color: "var(--text-primary)" }}>{i.label} {pct(i.growth * 100, 1)}</span>
                  </span>
                ))}
                {" "}— damped toward the mean and capped at ±50% a year. Treat it as the trend&apos;s own
                implication, and weigh it against the analyst price targets below.
              </div>
            </>
          )}

          {/* ── Ownership Breakdown ── */}
          <SectionLabel right={
            ownershipReady?.found ? (
              <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>
                SEC Form 13F · {ownershipReady.quarter}
              </span>
            ) : undefined
          }>Ownership Breakdown</SectionLabel>

          {!ownershipReady ? (
            <div style={{ ...CARD, padding: "18px 20px", opacity: 0.6 }}>
              <div style={{ fontFamily: SANS, fontSize: "0.78rem", color: "var(--text-muted)" }}>Loading 13F filings…</div>
            </div>
          ) : !ownershipReady.found ? (
            <NASection reason={ownershipReady.reason ?? "No institutional positions reported for this security in the latest quarter."} />
          ) : (
            <>
              <Grid cols={3}>
                {/* A share count can be missing or wrong — filers with multiple
                    classes stop tagging it, and a stale one produced Visa at
                    312% and Mastercard at 626% institutional. Anything above
                    100% means the denominator is untrustworthy, not that the
                    holdings are, so the shares are shown instead of a ratio
                    that would be plainly false. */}
                {(() => {
                  const held = ownershipReady.shares ?? 0;
                  const outstanding = fun?.shares ?? null;
                  const ratio = outstanding ? (held / outstanding) * 100 : null;
                  const usable = ratio != null && ratio > 0 && ratio <= 100;
                  return (
                    <MCard label="Institutional Ownership"
                      value={usable ? `${ratio!.toFixed(1)}%` : compact(held)}
                      sub={usable
                        ? `${compact(held)} of ${compact(outstanding)} shares`
                        : "shares held · share count unavailable"}
                      tone="default" />
                  );
                })()}
                <MCard label="Institutions Holding" value={(ownershipReady.filers ?? 0).toLocaleString("en-US")}
                  sub="managers filing 13F" />
                <MCard label="Top 10 Concentration"
                  value={`${(
                    ((ownershipReady.top ?? []).reduce((a: number, h: Holder) => a + h.shares, 0) /
                      (ownershipReady.shares || 1)) * 100
                  ).toFixed(1)}%`}
                  sub="of institutional shares" />
              </Grid>

              <div style={{ ...CARD, padding: "6px 0", marginTop: 10 }}>
                {ownershipReady.top!.map((h: Holder, i: number) => (
                  <div key={h.name + i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "9px 16px", borderTop: i ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{ fontFamily: SANS, fontSize: "0.76rem" }}>
                      <span style={{ fontFamily: MONO, color: "var(--text-muted)", marginRight: 10 }}>{i + 1}</span>
                      {h.name}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: "0.76rem", whiteSpace: "nowrap" }}>
                      {compact(h.shares)}
                      {fun?.shares ? (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>
                          {" "}· {((h.shares / fun.shares) * 100).toFixed(2)}%
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
                Positions reported on Form 13F for the quarter ended {ownershipReady.quarter}, deduplicated by filer
                and with options excluded. 13F covers institutional managers over $100M only — insider and retail
                holdings aren&rsquo;t in this data, so this is not a full float breakdown.
              </div>
            </>
          )}

          {/* ── ETF Ownership ── */}
          <SectionLabel right={
            etfHolders?.matches?.length ? (
              <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>
                found in {etfHolders.matches.length} of {etfHolders.scanned} funds scanned
              </span>
            ) : undefined
          }>ETF Ownership</SectionLabel>
          {!etfHolders ? (
            <div style={{ ...CARD, padding: "8px 0" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: "var(--bg-elevated)" }} />
                  <div style={{ width: 58, height: 12, borderRadius: 4, background: "var(--bg-elevated)" }} />
                  <div style={{ flex: 1 }} />
                  <div style={{ width: 72, height: 12, borderRadius: 4, background: "var(--bg-elevated)" }} />
                </div>
              ))}
            </div>
          ) : etfHolders.matches.length === 0 ? (
            <NASection reason={
              etfHolders.failed
                ? "The ETF holdings scan didn't complete for this ticker."
                : `${data.ticker} doesn't appear in any of the ${etfHolders.scanned ?? ""} major ETF portfolios scanned. Holdings come from quarterly SEC N-PORT filings, so a very recent index addition may not show up yet.`
            } />
          ) : (
            <>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.77rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "9px 14px", fontWeight: 600 }}>ETF</th>
                      <th style={{ textAlign: "left", padding: "9px 10px", fontWeight: 600 }}>Fund</th>
                      <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Weight</th>
                      <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Rank</th>
                      <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Value Held</th>
                      <th style={{ textAlign: "left", padding: "9px 14px", fontWeight: 600, minWidth: 100 }}>Share of Fund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etfHolders.matches.map((m: any) => (
                      <tr key={m.ticker} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 14px" }}>
                          <Link href={`/etf?ticker=${m.ticker}`} style={{ fontFamily: MONO, fontWeight: 700, color: "var(--accent-gold)", textDecoration: "none" }}>
                            {m.ticker}
                          </Link>
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>
                          {m.label}
                          <span style={{ marginLeft: 8, fontSize: "0.6rem", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>{m.category}</span>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, fontWeight: 700, color: "var(--accent-gold)" }}>{m.weightPct.toFixed(2)}%</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{m.rank ? `#${m.rank}` : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, color: "var(--text-secondary)" }}>{compact(m.valueUsd)}</td>
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ height: 5, background: "var(--bg-elevated)", borderRadius: 999, overflow: "hidden", minWidth: 80 }}>
                            <div style={{
                              width: `${Math.min(100, (m.weightPct / (etfHolders.matches[0]?.weightPct || 1)) * 100)}%`,
                              height: "100%", background: "var(--accent-gold)", borderRadius: 999,
                            }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 10 }}>
                Weights are as-of each fund&apos;s latest quarterly SEC N-PORT filing, matched on registrant name.
                Only a curated set of major funds is scanned, so this is a representative sample, not every ETF holding {data.ticker}.
              </div>
            </>
          )}

          {/* ── Earnings Call Transcripts ── */}
          <SectionLabel>Earnings Call Transcripts</SectionLabel>
          <NASection reason="Marketstack does not offer transcripts at any tier." />

          {/* ── Insider Activity ── */}
          <SectionLabel>Insider Activity — Form 4</SectionLabel>
          <NASection reason="Form 4 filings are listed in the SEC Filings section below (via the submissions endpoint), but marketstack provides no parsed insider transactions — no buy/sell direction, share counts, or values." />

          {/* ── Institutional Holders ── */}
          <SectionLabel>Institutional Holders</SectionLabel>
          <NASection reason="No 13F holdings endpoint. Same as Ownership Breakdown: available free from SEC EDGAR, but requires building the parser." />

          {/* ── Dividends ── */}
          <SectionLabel right={div?.count ? <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>{div.count} records since {div.oldest}</span> : undefined}>
            Dividends
          </SectionLabel>
          {div?.count > 0 ? (
            <>
              <Grid cols={5}>
                <MCard label="TTM Dividends" value={money(div.ttmTotal)} />
                <MCard label="Yield" value={div.yieldPct != null ? `${div.yieldPct.toFixed(2)}%` : "N/A"} tone="good" />
                <MCard label="Frequency" value={div.freq === "q" ? "Quarterly" : div.freq === "m" ? "Monthly" : div.freq === "s" ? "Semi-Annual" : div.freq ?? "N/A"} />
                {div.upcoming?.length > 0
                  ? <MCard label="Next Ex-Date" value={div.upcoming[0].date} sub={`${money(div.upcoming[0].amount)}${div.upcoming[0].paymentDate ? ` · pays ${div.upcoming[0].paymentDate}` : ""}`} tone="good" />
                  : div.projectedNext
                  ? <MCard label="Next Ex-Date" value={`~ ${div.projectedNext.date}`}
                      sub={`expected · ${div.projectedNext.basis} cadence, not yet declared`} />
                  : <MCard label="Next Ex-Date" value="Not declared" />}
                <MCard label="History Depth" value={String(div.count)} sub={`back to ${String(div.oldest).slice(0, 4)}`} />
              </Grid>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-Date</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Amount</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.recent.map((d: any) => (
                      <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 14px", color: "var(--text-secondary)" }}>{d.date}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{money(d.amount)}</td>
                        <td style={{ padding: "6px 14px", textAlign: "right", color: "var(--text-muted)" }}>{d.paymentDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ ...CARD, padding: "14px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>No dividends on record.</div>
          )}

          {/* ── SEC Filings ── */}
          {data.filings?.length > 0 && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>via marketstack EDGAR submissions</span>}>
                SEC Filings
              </SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Form</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Description</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Filed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.filings.map((f: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 14px", fontFamily: MONO, fontWeight: 600, color: "var(--accent-gold)" }}>
                          {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{f.form}</a> : f.form}
                        </td>
                        <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{f.description}</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{f.filed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Splits ── */}
          {data.splits?.length > 0 && (
            <>
              <SectionLabel>Split History</SectionLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.splits.map((s: any) => (
                  <span key={s.date} style={{ ...CARD, borderRadius: 999, padding: "6px 14px", fontFamily: MONO, fontSize: "0.74rem" }}>
                    <span style={{ fontWeight: 700 }}>{s.factor}:1</span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{s.date}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── About / Profile ── */}
          {prof?.about && (
            <>
              <SectionLabel>About</SectionLabel>
              <div style={{ ...CARD, padding: "16px 20px", fontSize: "0.82rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>
                {prof.about}
                <div style={{ marginTop: 12, fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.9 }}>
                  {prof.employees != null && <div>👥 {Number(prof.employees).toLocaleString()} employees</div>}
                  {prof.address && <div>🏢 {prof.address}</div>}
                  {prof.website && <div>🔗 <a href={prof.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{prof.website}</a></div>}
                </div>
              </div>
            </>
          )}

          {/* ── Executives ── */}
          {prof?.executives?.length > 0 && (
            <>
              <SectionLabel>Key Executives</SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <tbody>
                    {prof.executives.map((e: any, i: number) => (
                      <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "8px 16px", fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: "8px 16px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{e.role ?? "—"}</td>
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

          {/* ── Technical Analysis ── */}
          <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>TradingView widget</span>}>
            Technical Analysis
          </SectionLabel>
          <TradingViewWidget
            key={`ta-${data.ticker}`}
            widget="technical-analysis"
            height={430}
            config={{ symbol: tvSymbol(data.ticker, prof?.exchange), interval: "1D", showIntervalTabs: true }}
          />

          {/* ── Recent News ── */}
          <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>TradingView widget</span>}>
            Recent News
          </SectionLabel>
          <TradingViewWidget
            key={`news-${data.ticker}`}
            widget="timeline"
            height={480}
            config={{ feedMode: "symbol", symbol: tvSymbol(data.ticker, prof?.exchange), displayMode: "regular" }}
          />

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "2rem", lineHeight: 1.6 }}>
            Prices, quotes, ratings, dividends, splits and filings from marketstack (Business plan); chart by
            TradingView. Fundamentals come from SEC EDGAR XBRL — marketstack&apos;s Statements/Facts/Concepts
            endpoints are on the pricing page but return &quot;route not found&quot;, and ETF holdings returns no data.
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketstackResearchPage() {
  return <Suspense fallback={null}><MarketstackResearchInner /></Suspense>;
}
