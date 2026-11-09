"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, Area, AreaChart, ResponsiveContainer
} from "recharts";
import { ChartTip, seriesTip, lineCursor, grid } from "@/components/charts/kit";

const HEADING: React.CSSProperties = {
  fontFamily: "'Space Grotesk', Georgia, serif",
  fontWeight: 500,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const MONO: React.CSSProperties = {
  fontFamily: "'Spline Sans Mono', monospace",
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

// Same card as the scenario cards on Projections: a hairline in the scenario's
// colour across the top, the label in that colour, the figure in text ink.
function SummaryCard({ label, result, color }: { label: string; result: CalcResult; color: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderTop: `2px solid ${color}`, borderRadius: 22, flex: 1, minWidth: 180 }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color, fontFamily: "'Public Sans', sans-serif", marginBottom: 6 }}>{label}</div>
        <div style={{ ...MONO, fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>{fmtDollar(result.final)}</div>
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

  const lowRate = inputs.baseRate - inputs.variance;
  const highRate = inputs.baseRate + inputs.variance;

  function handleChange(field: keyof Inputs, val: number) {
    setInputs(prev => ({ ...prev, [field]: val }));
  }

  // Results update live as assumptions change
  const results: Results = {
    low:  calcGrowth(inputs.principal, inputs.monthly, inputs.years, inputs.baseRate - inputs.variance),
    base: calcGrowth(inputs.principal, inputs.monthly, inputs.years, inputs.baseRate),
    high: calcGrowth(inputs.principal, inputs.monthly, inputs.years, inputs.baseRate + inputs.variance),
    inputs: { ...inputs },
  };

  function reset() {
    setInputs({ principal: 30000, monthly: 1500, years: 15, baseRate: 15.0, variance: 5.0 });
  }

  const chartData = Array.from({ length: results.inputs.years }, (_, i) => ({
    year: i + 1,
    Low: results.low.yearly[i],
    Base: results.base.yearly[i],
    High: results.high.yearly[i],
  }));

  const tableData = Array.from({ length: results.inputs.years }, (_, i) => ({
    year: i + 1,
    contributed: results.inputs.principal + results.inputs.monthly * 12 * (i + 1),
    low: results.low.yearly[i],
    base: results.base.yearly[i],
    high: results.high.yearly[i],
  }));

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 22,
    color: "var(--text-primary)", padding: "8px 10px", fontSize: 14,
    fontFamily: "'Spline Sans Mono', monospace", outline: "none", width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: "var(--text-secondary)", fontFamily: "'Public Sans', sans-serif",
    marginBottom: 4, display: "block", letterSpacing: "0.03em",
  };

  return (
    <div>
      <PageHeader title="Compound Calculator"
        subtitle="What steady investing does over decades, under a low, a base and a high return." />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Inputs Panel */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 24, padding: "20px 22px", width: "clamp(280px, 38%, 380px)", flexShrink: 0 }}>
          <h2 style={{ ...HEADING, fontSize: 16, margin: "0 0 18px" }}>Assumptions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="calc-initial-investment" style={labelStyle}>Initial Investment ($)</label>
              <input id="calc-initial-investment" type="number" value={inputs.principal} onChange={e => handleChange("principal", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="calc-monthly-contribution" style={labelStyle}>Monthly Contribution ($)</label>
              <input id="calc-monthly-contribution" type="number" value={inputs.monthly} onChange={e => handleChange("monthly", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="calc-time-horizon-years" style={labelStyle}>Time Horizon (Years)</label>
              <input id="calc-time-horizon-years" type="number" value={inputs.years} min={1} max={50} onChange={e => handleChange("years", parseInt(e.target.value) || 1)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="calc-annual-return-rate-base" style={labelStyle}>Annual Return Rate — Base (%)</label>
              <input id="calc-annual-return-rate-base" type="number" value={inputs.baseRate} step={0.5} onChange={e => handleChange("baseRate", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="calc-variance-range" style={labelStyle}>Variance Range (±%)</label>
              <input id="calc-variance-range" type="number" value={inputs.variance} step={0.5} onChange={e => handleChange("variance", parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>

            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontSize: 13, ...MONO }}>
              <span style={{ color: "var(--negative)" }}>Low: {lowRate.toFixed(1)}%</span>
              <span style={{ color: "var(--accent-gold)" }}>Base: {inputs.baseRate.toFixed(1)}%</span>
              <span style={{ color: "var(--positive)" }}>High: {highRate.toFixed(1)}%</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                onClick={reset}
                style={{ flex: 1, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 16px", fontSize: 14, cursor: "pointer", fontFamily: "'Public Sans', sans-serif" }}
              >Reset to defaults</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Public Sans', sans-serif" }}>
              Projections update live as you edit.
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div style={{ flex: 1, minWidth: 300 }}>
          {(
            <>
              <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
                <SummaryCard label="Low"  result={results.low}  color="var(--negative)" />
                <SummaryCard label="Base" result={results.base} color="var(--accent-gold)" />
                <SummaryCard label="High" result={results.high} color="var(--positive)" />
              </div>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 24, padding: "16px 18px" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="year" stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)", fontSize: 11, fontFamily: "Spline Sans Mono" }} />
                    <YAxis stroke="var(--text-secondary)" tick={{ fill: "var(--text-secondary)", fontSize: 11, fontFamily: "Spline Sans Mono" }} tickFormatter={v => fmtDollar(v)} width={75} />
                    <Tooltip isAnimationActive={false} cursor={lineCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
                    content={<ChartTip build={seriesTip({ title: (l) => `Year ${l}`, value: (v) => fmtDollar(v) })} />} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Spline Sans Mono", paddingTop: 8 }} />
                    <Area type="monotone" dataKey="High" stroke="var(--positive)"    strokeWidth={2} fill="var(--accent-gold)" fillOpacity={0.06} dot={false} />
                    <Line type="monotone" dataKey="Base" stroke="var(--accent-gold)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                    <Line type="monotone" dataKey="Low"  stroke="var(--negative)"    strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>

      {results && (
        <>
          {/* Insight box */}
          <div style={{ marginTop: 28, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "14px 18px", fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)", fontFamily: "'Public Sans', sans-serif" }}>
            <strong style={{ color: "var(--accent-gold)" }}>Insight: </strong>
            The difference between the high ({(results.inputs.baseRate + results.inputs.variance).toFixed(1)}%) and low ({(results.inputs.baseRate - results.inputs.variance).toFixed(1)}%) return scenarios over {results.inputs.years} years is{" "}
            <span style={{ ...MONO, color: "var(--positive)", fontWeight: 600 }}>{fmtDollar(results.high.final - results.low.final)}</span>
            {" "}— a {((results.high.final / results.low.final - 1) * 100).toFixed(0)}% difference from an identical starting position.
          </div>

          {/* Year-by-year table */}
          <div style={{ marginTop: 28 }}>
            <h3 style={{ ...HEADING, fontSize: 16, margin: "0 0 12px" }}>Year-by-Year Breakdown</h3>
            <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 24 }}>
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

