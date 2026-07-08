"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, Area, AreaChart, ResponsiveContainer
} from "recharts";

const HEADING: React.CSSProperties = {
  fontFamily: "'IBM Plex Serif', Georgia, serif",
  fontWeight: 500,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
};

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtB(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function cagrCalc(final: number, initial: number, years: number): number {
  if (initial <= 0 || years <= 0) return 0;
  return Math.pow(final / initial, 1 / years) - 1;
}

type ScenarioKey = "bull" | "base" | "bear";

interface YearAssumptions {
  revGrowth: number;
  niGrowth: number;
  peLow: number;
  peHigh: number;
}

type ScenarioAssumptions = Record<number, YearAssumptions>;

interface ScenarioDefaults {
  revGrowth: number;
  niGrowth: number;
  peLow: number;
  peHigh: number;
  color: string;
  headerBg: string;
  label: string;
}

const SCENARIO_DEFAULTS: Record<ScenarioKey, ScenarioDefaults> = {
  bull: { revGrowth: 15, niGrowth: 20, peLow: 25, peHigh: 45, color: "#22C55E", headerBg: "#166534", label: "BULL" },
  base: { revGrowth: 10, niGrowth: 12, peLow: 18, peHigh: 28, color: "#3B82F6", headerBg: "#1D4ED8", label: "BASE" },
  bear: { revGrowth: 3,  niGrowth: 3,  peLow: 10, peHigh: 16, color: "#EF4444", headerBg: "#991B1B", label: "BEAR" },
};

const CURRENT_YEAR = new Date().getFullYear();
const PROJ_YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, CURRENT_YEAR + 4];

function defaultAssumptions(key: ScenarioKey): ScenarioAssumptions {
  const d = SCENARIO_DEFAULTS[key];
  const obj: ScenarioAssumptions = {};
  for (const y of PROJ_YEARS) {
    obj[y] = { revGrowth: d.revGrowth, niGrowth: d.niGrowth, peLow: d.peLow, peHigh: d.peHigh };
  }
  return obj;
}

interface StockData {
  price: number;
  revenue: number;
  netIncome: number;
  netMargin: number;
  eps: number;
  mktCap: number;
}

interface ProjectionRow {
  year: number | string;
  revenue: number;
  revGrowth: number | null;
  netIncome: number;
  niGrowth: number | null;
  netMargin: number;
  eps: number;
  peLow: number | null;
  peHigh: number | null;
  spLow: number | null;
  spHigh: number | null;
  cagrLow: number | null;
  cagrHigh: number | null;
}

function computeProjections(
  stock: StockData,
  assumptions: ScenarioAssumptions
): ProjectionRow[] {
  const shares = stock.mktCap / stock.price;
  const baseRow: ProjectionRow = {
    year: CURRENT_YEAR,
    revenue: stock.revenue,
    revGrowth: null,
    netIncome: stock.netIncome,
    niGrowth: null,
    netMargin: stock.netMargin,
    eps: stock.eps,
    peLow: null,
    peHigh: null,
    spLow: null,
    spHigh: null,
    cagrLow: null,
    cagrHigh: null,
  };

  const rows: ProjectionRow[] = [baseRow];
  let prevRev = stock.revenue;
  let prevNI = stock.netIncome;
  let prevEPS = stock.eps;

  for (let i = 0; i < PROJ_YEARS.length; i++) {
    const y = PROJ_YEARS[i];
    const a = assumptions[y];
    const rev = prevRev * (1 + a.revGrowth / 100);
    const ni = prevNI * (1 + a.niGrowth / 100);
    const margin = rev !== 0 ? ni / rev : 0;
    const eps = ni / shares;
    const spLow = eps * a.peLow;
    const spHigh = eps * a.peHigh;
    const n = i + 1;
    const cagrLow = cagrCalc(spLow, stock.price, n);
    const cagrHigh = cagrCalc(spHigh, stock.price, n);

    rows.push({
      year: y,
      revenue: rev,
      revGrowth: a.revGrowth,
      netIncome: ni,
      niGrowth: a.niGrowth,
      netMargin: margin,
      eps,
      peLow: a.peLow,
      peHigh: a.peHigh,
      spLow,
      spHigh,
      cagrLow,
      cagrHigh,
    });

    prevRev = rev;
    prevNI = ni;
    prevEPS = eps;
  }

  return rows;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "1rem",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ ...MONO, fontSize: 18, color: "var(--text-primary)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function AssumptionInputs({
  scenarioKey,
  assumptions,
  onChange,
}: {
  scenarioKey: ScenarioKey;
  assumptions: ScenarioAssumptions;
  onChange: (year: number, field: keyof YearAssumptions, val: number) => void;
}) {
  const fields: { key: keyof YearAssumptions; label: string }[] = [
    { key: "revGrowth", label: "Rev Growth %" },
    { key: "niGrowth", label: "NI Growth %" },
    { key: "peLow", label: "PE Low" },
    { key: "peHigh", label: "PE High" },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, ...MONO }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-secondary)", fontWeight: 500, width: 130 }}>Assumption</th>
            {PROJ_YEARS.map(y => (
              <th key={y} style={{ padding: "6px 10px", color: "var(--text-secondary)", fontWeight: 500, minWidth: 90 }}>{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.key}>
              <td style={{ padding: "5px 10px", color: "var(--text-secondary)" }}>{f.label}</td>
              {PROJ_YEARS.map(y => (
                <td key={y} style={{ padding: "4px 6px" }}>
                  <input
                    type="number"
                    value={assumptions[y][f.key]}
                    onChange={e => onChange(y, f.key, parseFloat(e.target.value) || 0)}
                    style={{
                      width: 75,
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      padding: "4px 6px",
                      fontSize: 13,
                      fontFamily: "'IBM Plex Mono', monospace",
                      outline: "none",
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectionTable({ rows, currentPrice }: { rows: ProjectionRow[]; currentPrice: number }) {
  const headers = [
    "Year", "Revenue", "Rev Growth%", "Net Income", "NI Growth%",
    "Net Margin%", "EPS", "PE Low", "PE High",
    "SP Low", "SP High", "CAGR Low", "CAGR High"
  ];

  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, ...MONO }}>
        <thead>
          <tr style={{ background: "var(--bg-primary)" }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: "7px 10px", color: "var(--text-secondary)", fontWeight: 500,
                textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)"
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.year} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
              <td style={{ padding: "6px 10px", color: "var(--accent-gold)", textAlign: "right", fontWeight: 600 }}>{row.year}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtB(row.revenue)}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: row.revGrowth == null ? "var(--text-secondary)" : "var(--text-primary)" }}>
                {row.revGrowth == null ? "—" : `${row.revGrowth.toFixed(1)}%`}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtB(row.netIncome)}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: row.niGrowth == null ? "var(--text-secondary)" : "var(--text-primary)" }}>
                {row.niGrowth == null ? "—" : `${row.niGrowth.toFixed(1)}%`}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{(row.netMargin * 100).toFixed(1)}%</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>${fmt(row.eps)}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.peLow ?? "—"}</td>
              <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.peHigh ?? "—"}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--positive)" }}>
                {row.spLow != null ? `$${fmt(row.spLow)}` : "—"}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--positive)" }}>
                {row.spHigh != null ? `$${fmt(row.spHigh)}` : "—"}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: row.cagrLow != null && row.cagrLow >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {row.cagrLow != null ? `${(row.cagrLow * 100).toFixed(1)}%` : "—"}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: row.cagrHigh != null && row.cagrHigh >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {row.cagrHigh != null ? `${(row.cagrHigh * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScenarioBlock({
  scenarioKey,
  stock,
  assumptions,
  onAssumptionChange,
}: {
  scenarioKey: ScenarioKey;
  stock: StockData;
  assumptions: ScenarioAssumptions;
  onAssumptionChange: (year: number, field: keyof YearAssumptions, val: number) => void;
}) {
  const def = SCENARIO_DEFAULTS[scenarioKey];
  const rows = computeProjections(stock, assumptions);

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      marginBottom: 24,
    }}>
      <div style={{ background: def.headerBg, padding: "10px 18px" }}>
        <span style={{ ...HEADING, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: "#fff" }}>{def.label} SCENARIO</span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <AssumptionInputs scenarioKey={scenarioKey} assumptions={assumptions} onChange={onAssumptionChange} />
        <ProjectionTable rows={rows} currentPrice={stock.price} />
      </div>
    </div>
  );
}

function CombinedChart({ stock, assumptions }: { stock: StockData; assumptions: Record<ScenarioKey, ScenarioAssumptions> }) {
  const years = [CURRENT_YEAR, ...PROJ_YEARS];
  const data = years.map((y, i) => {
    const point: Record<string, number | string> = { year: y };
    for (const key of (["bull", "base", "bear"] as ScenarioKey[])) {
      if (i === 0) {
        point[`${key}Low`] = stock.price;
        point[`${key}High`] = stock.price;
      } else {
        const rows = computeProjections(stock, assumptions[key]);
        const row = rows[i];
        point[`${key}Low`] = row.spLow ?? stock.price;
        point[`${key}High`] = row.spHigh ?? stock.price;
      }
    }
    return point;
  });

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ ...HEADING, fontSize: 16, marginBottom: 16, marginTop: 0 }}>Price Projection Chart</h3>
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="bullFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22C55E" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#22C55E" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="baseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="bearFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
          <XAxis dataKey="year" stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)", fontSize: 12, fontFamily: "IBM Plex Mono" }} />
          <YAxis stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)", fontSize: 12, fontFamily: "IBM Plex Mono" }} tickFormatter={v => `$${v.toFixed(0)}`} />
          <Tooltip
            contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "IBM Plex Mono" }}
            labelStyle={{ color: "var(--accent-gold)" }}
            itemStyle={{ color: "var(--text-primary)" }}
            formatter={(v: any) => `$${v.toFixed(2)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: "IBM Plex Mono", paddingTop: 12 }} />
          <ReferenceLine y={stock.price} stroke="var(--accent-gold)" strokeDasharray="6 3" label={{ value: `Current $${stock.price.toFixed(2)}`, fill: "var(--accent-gold)", fontSize: 11, fontFamily: "IBM Plex Mono" }} />
          <Area type="monotone" dataKey="bullHigh" stroke="#22C55E" strokeWidth={2} fill="url(#bullFill)" name="Bull High" dot={false} />
          <Area type="monotone" dataKey="bullLow"  stroke="#22C55E" strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" name="Bull Low" dot={false} />
          <Area type="monotone" dataKey="baseHigh" stroke="#3B82F6" strokeWidth={2} fill="url(#baseFill)" name="Base High" dot={false} />
          <Area type="monotone" dataKey="baseLow"  stroke="#3B82F6" strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" name="Base Low" dot={false} />
          <Area type="monotone" dataKey="bearHigh" stroke="#EF4444" strokeWidth={2} fill="url(#bearFill)" name="Bear High" dot={false} />
          <Area type="monotone" dataKey="bearLow"  stroke="#EF4444" strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" name="Bear Low" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>{title}</div>
      <div style={{ border: "1px dashed var(--border-active)", borderRadius: 4, background: "var(--bg-surface)", padding: "34px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-muted)" }}>{desc}</span>
      </div>
    </div>
  );
}

function ProjectionsInner() {
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [stock, setStock] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assumptions, setAssumptions] = useState<Record<ScenarioKey, ScenarioAssumptions>>({
    bull: defaultAssumptions("bull"),
    base: defaultAssumptions("base"),
    bear: defaultAssumptions("bear"),
  });

  useEffect(() => {
    const q = searchParams.get("ticker");
    if (q) { setInputVal(q.toUpperCase()); loadStock(q.toUpperCase()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStock(symArg?: string) {
    const t = (symArg ?? inputVal).trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock/${t}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const s = data.stock;
      const ni = s.netIncome ?? (s.netMargin != null && s.revenue != null ? s.netMargin * s.revenue : null);
      if (!s.price || !s.revenue || ni == null || !s.eps || !s.mktCap) {
        throw new Error("Missing required stock fields");
      }
      setStock({
        price: s.price,
        revenue: s.revenue,
        netIncome: ni,
        netMargin: s.netMargin ?? ni / s.revenue,
        eps: s.eps,
        mktCap: s.mktCap,
      });
      setTicker(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function handleAssumptionChange(scenario: ScenarioKey, year: number, field: keyof YearAssumptions, val: number) {
    setAssumptions(prev => ({
      ...prev,
      [scenario]: {
        ...prev[scenario],
        [year]: { ...prev[scenario][year], [field]: val },
      },
    }));
  }

  const shares = stock ? stock.mktCap / stock.price : null;

  return (
    <div style={{ padding: "2rem", margin: "0 auto" }}>
      <h1 style={{ ...HEADING, fontSize: "1.75rem", margin: "0 0 0.5rem" }}>Projections</h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "2rem" }} />

      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 32, alignItems: "center" }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && loadStock()}
          placeholder="Ticker"
          style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6,
            color: "var(--text-primary)", padding: "9px 14px", fontSize: 14, outline: "none",
            width: 200, fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        />
        <button
          onClick={() => loadStock()}
          disabled={loading}
          style={{
            background: "var(--accent-gold)", color: "#131C2E", border: "none", borderRadius: 4,
            padding: "10px 22px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          {loading ? "Loading..." : "Load"}
        </button>
        {error && <span style={{ color: "var(--negative)", fontSize: 13 }}>{error}</span>}
      </div>

      {!stock && !loading && !error && (
        <>
          <EmptyHint title="Base Year Snapshot" desc="Current price, revenue, net income, margins, EPS, and shares outstanding — the starting point for every scenario." />
          <EmptyHint title="Bull / Base / Bear Scenarios" desc="Five-year projections with editable revenue growth, net income growth, and P/E ranges per scenario." />
          <EmptyHint title="Price Targets & CAGR" desc="Implied share price range and compound annual return for every scenario and year." />
        </>
      )}

      {stock && (
        <>
          {/* Base Year Panel */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ ...HEADING, fontSize: 18, margin: "0 0 14px" }}>
              {ticker} — Base Year ({CURRENT_YEAR})
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              <MetricCard label="Current Price" value={`$${stock.price.toFixed(2)}`} />
              <MetricCard label="Revenue TTM" value={fmtB(stock.revenue)} />
              <MetricCard label="Net Income TTM" value={fmtB(stock.netIncome)} />
              <MetricCard label="Net Margin" value={`${(stock.netMargin * 100).toFixed(1)}%`} />
              <MetricCard label="EPS TTM" value={`$${stock.eps.toFixed(2)}`} />
              <MetricCard label="Shares Out." value={shares ? `${(shares / 1e6).toFixed(0)}M` : "—"} />
            </div>
          </div>

          {/* Scenarios */}
          {(["bull", "base", "bear"] as ScenarioKey[]).map(key => (
            <ScenarioBlock
              key={key}
              scenarioKey={key}
              stock={stock}
              assumptions={assumptions[key]}
              onAssumptionChange={(year, field, val) => handleAssumptionChange(key, year, field, val)}
            />
          ))}

          {/* Combined Chart */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 24px" }}>
            <CombinedChart stock={stock} assumptions={assumptions} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectionsPage() {
  return <Suspense fallback={null}><ProjectionsInner /></Suspense>;
}
