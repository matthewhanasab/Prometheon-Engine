"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, Area, AreaChart, ResponsiveContainer
} from "recharts";

const HEADING: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontWeight: 500,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
};

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface CalcResult {
  yearly: number[];
  final: number;
  totalContrib: number;
  interest: number;
}

function calcGrowth(principal: number, monthly: number, years: number, annualPct: number): CalcResult {
  const r = annualPct / 100 / 12;
  let amount = principal;
  const yearly: number[] = [];
  for (let y = 0; y < years; y++) {
    for (let m = 0; m < 12; m++) {
      amount = amount * (1 + r) + monthly;
    }
    yearly.push(amount);
  }
  return {
    yearly,
    final: amount,
    totalContrib: principal + monthly * 12 * years,
    interest: amount - (principal + monthly * 12 * years),
  };
}

interface Inputs {
  principal: number;
  monthly: number;
  years: number;
  baseRate: number;
  variance: number;
}

interface Results {
  low: CalcResult;
  base: CalcResult;
  high: CalcResult;
  inputs: Inputs;
}

function SummaryCard({ label, result, color, accentBg }: { label: string; result: CalcResult; color: string; accentBg: string }) {
  return (
    <div style={{ background: "var(--bg-elevated)", border: `1px solid ${color}40`, borderRadius: 10, overflow: "hidden", flex: 1, minWidth: 180 }}>
      <div style={{ background: accentBg, padding: "8px 14px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#fff", fontFamily: "Inter, sans-serif" }}>{label}</span>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ ...HEADING, fontSize: "1.6rem", color, marginBottom: 8 }}>{fmtDollar(result.final)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
            <span>Total contributed</span>
            <span style={{ ...MONO, color: "var(--text-primary)" }}>{fmtDollar(result.totalContrib)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
            <span>Interest earned</span>
            <span style={{ ...MONO, color }}>{fmtDollar(result.interest)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const [inputs, setInputs] = useState<Inputs>({ principal: 30000, monthly: 1500, years: 15, baseRate: 15.0, variance: 5.0 });
  const [results, setResults] = useState<Results | null>(null);

  const lowRate = inputs.baseRate - inputs.variance;
  const highRate = inputs.baseRate + inputs.variance;

  function handleChange(field: keyof Inputs, val: number) {
    setInputs(prev => ({ ...prev, [field]: val }));
  }

  function calculate() {
    const { principal, monthly, years, baseRate, variance } = inputs;
    setResults({
      low: calcGrowth(principal, monthly, years, baseRate - variance),
      base: calcGrowth(principal, monthly, years, baseRate),
      high: calcGrowth(principal, monthly, years, baseRate + variance),
      inputs: { ...inputs },
    });
  }

  function reset() {
    setInputs({ principal: 30000, monthly: 1500, years: 15, baseRate: 15.0, variance: 5.0 });
    setResults(null);
  }

  const chartData = results
    ? Array.from({ length: results.inputs.years }, (_, i) => ({
        year: i + 1,
        Low: results.low.yearly[i],
        Base: results.base.yearly[i],
        High: results.high.yearly[i],
      }))
    : [];

  const tableData = results
    ? Array.from({ length: results.inputs.years }, (_, i) => ({
        year: i + 1,
        contributed: results.inputs.principal + results.inputs.monthly * 12 * (i + 1),
        low: results.low.yearly[i],
        base: results.base.yearly[i],
        high: results.high.yearly[i],
      }))
    : [];

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 6,
    color: "var(--text-primary)", padding: "8px 10px", fontSize: 14,
    fontFamily: "'IBM Plex Mono', monospace", outline: "none", width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif",
    marginBottom: 4, display: "block", letterSpacing: "0.03em",
  };

  return (
    <div style={{ padding: "2rem", margin: "0 auto" }}>
      <h1 style={{ ...HEADING, fontSize: "1.75rem", margin: "0 0 0.5rem" }}>Compound Calculator</h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "2rem" }} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Inputs Panel */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 22px", width: "clamp(280px, 38%, 380px)", flexShrink: 0 }}>
          <h2 style={{ ...HEADING, fontSize: 16, margin: "0 0 18px" }}>Assumptions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Initial Investment ($)</label>
              <input type="number" value={inputs.principal} onChange={e => handleChange("principal", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Monthly Contribution ($)</label>
              <input type="number" value={inputs.monthly} onChange={e => handleChange("monthly", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time Horizon (Years)</label>
              <input type="number" value={inputs.years} min={1} max={50} onChange={e => handleChange("years", parseInt(e.target.value) || 1)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Annual Return Rate — Base (%)</label>
              <input type="number" value={inputs.baseRate} step={0.5} onChange={e => handleChange("baseRate", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Variance Range (Â±%)</label>
              <input type="number" value={inputs.variance} step={0.5} onChange={e => handleChange("variance", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>

            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontSize: 13, ...MONO }}>
              <span style={{ color: "var(--negative)" }}>Low: {lowRate.toFixed(1)}%</span>
              <span style={{ color: "var(--accent-gold)" }}>Base: {inputs.baseRate.toFixed(1)}%</span>
              <span style={{ color: "var(--positive)" }}>High: {highRate.toFixed(1)}%</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                onClick={calculate}
                style={{ flex: 1, background: "var(--accent-gold)", color: "#000", border: "none", borderRadius: 6, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
              >Calculate</button>
              <button
                onClick={reset}
                style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
              >Reset</button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div style={{ flex: 1, minWidth: 300 }}>
          {results ? (
            <>
              <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
                <SummaryCard label="LOW PROJECTION"  result={results.low}  color="var(--negative)"    accentBg="#6E3229" />
                <SummaryCard label="BASE PROJECTION" result={results.base} color="var(--accent-gold)" accentBg="#6B4E1F" />
                <SummaryCard label="HIGH PROJECTION" result={results.high} color="var(--positive)"    accentBg="#42522B" />
              </div>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.07} />
                        <stop offset="95%" stopColor="#C9A84C" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis dataKey="year" stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)", fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                    <YAxis stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickFormatter={v => fmtDollar(v)} width={75} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "IBM Plex Mono" }}
                      labelStyle={{ color: "var(--accent-gold)" }}
                      formatter={(v: any) => fmtDollar(v)}
                      labelFormatter={(l) => `Year ${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "IBM Plex Mono", paddingTop: 8 }} />
                    <Area type="monotone" dataKey="High" stroke="var(--positive)"    strokeWidth={2} fill="url(#bandFill)" dot={false} />
                    <Line type="monotone" dataKey="Base" stroke="var(--accent-gold)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                    <Line type="monotone" dataKey="Low"  stroke="var(--negative)"    strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
              Enter your assumptions and click <strong style={{ color: "var(--accent-gold)" }}>Calculate</strong> to see projections.
            </div>
          )}
        </div>
      </div>

      {results && (
        <>
          {/* Insight box */}
          <div style={{ marginTop: 28, background: "var(--bg-surface)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent-gold)", borderRadius: 8, padding: "14px 18px", fontSize: 14, color: "var(--text-primary)", fontFamily: "Inter, sans-serif" }}>
            <strong style={{ color: "var(--accent-gold)" }}>Insight: </strong>
            The difference between the high ({(results.inputs.baseRate + results.inputs.variance).toFixed(1)}%) and low ({(results.inputs.baseRate - results.inputs.variance).toFixed(1)}%) return scenarios over {results.inputs.years} years is{" "}
            <span style={{ ...MONO, color: "var(--positive)", fontWeight: 600 }}>{fmtDollar(results.high.final - results.low.final)}</span>
            {" "}— a {((results.high.final / results.low.final - 1) * 100).toFixed(0)}% difference from an identical starting position.
          </div>

          {/* Year-by-year table */}
          <div style={{ marginTop: 28 }}>
            <h3 style={{ ...HEADING, fontSize: 16, margin: "0 0 12px" }}>Year-by-Year Breakdown</h3>
            <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, ...MONO }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--bg-elevated)", zIndex: 1 }}>
                  <tr>
                    {["Year", "Total Contributed", "Low", "Base", "High"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "right", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={row.year} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--accent-gold)", fontWeight: 600 }}>{row.year}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{fmtDollar(row.contributed)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--negative)" }}>{fmtDollar(row.low)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--accent-gold)" }}>{fmtDollar(row.base)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--positive)" }}>{fmtDollar(row.high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

