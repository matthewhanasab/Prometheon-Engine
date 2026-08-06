"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";
import MsNav from "@/components/MsNav";

// Financials — Market Stack edition. Mirrors /financials row for row, but the
// numbers come from SEC EDGAR XBRL rather than a licensed fundamentals feed.
// Same three tabs, same annual/quarterly toggle, same line items.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";

type RowDef = {
  label: string;
  field: string;
  bold?: boolean;
  invertColor?: boolean; // cost rows: higher = red
  isEps?: boolean;
  section?: string;
};

const INCOME_ROWS: RowDef[] = [
  { label: "Revenue", field: "revenue", bold: true },
  { label: "Cost of Revenue", field: "costOfRevenue", invertColor: true },
  { label: "Gross Profit", field: "grossProfit", bold: true },
  { label: "R&D", field: "researchAndDevelopmentExpenses", invertColor: true },
  { label: "SG&A", field: "sellingGeneralAndAdministrativeExpenses", invertColor: true },
  { label: "Operating Income", field: "operatingIncome", bold: true },
  { label: "Interest Expense", field: "interestExpense", invertColor: true },
  { label: "Pre-Tax Income", field: "incomeBeforeTax" },
  { label: "Income Tax", field: "incomeTaxExpense", invertColor: true },
  { label: "Net Income", field: "netIncome", bold: true },
  { label: "EBITDA", field: "ebitda", bold: true },
  { label: "Diluted EPS", field: "epsDiluted", isEps: true },
];

const BALANCE_ROWS: RowDef[] = [
  { label: "ASSETS", field: "", section: "ASSETS" },
  { label: "Cash & Equivalents", field: "cashAndCashEquivalents" },
  { label: "Short-Term Investments", field: "shortTermInvestments" },
  { label: "Receivables", field: "netReceivables" },
  { label: "Inventory", field: "inventory" },
  { label: "Total Current Assets", field: "totalCurrentAssets", bold: true },
  { label: "PP&E net", field: "propertyPlantEquipmentNet" },
  { label: "Goodwill & Intangibles", field: "goodwillAndIntangibleAssets" },
  { label: "Total Assets", field: "totalAssets", bold: true },
  { label: "LIABILITIES", field: "", section: "LIABILITIES" },
  { label: "Accounts Payable", field: "accountPayables" },
  { label: "Short-Term Debt", field: "shortTermDebt" },
  { label: "Total Current Liab.", field: "totalCurrentLiabilities", bold: true },
  { label: "Long-Term Debt", field: "longTermDebt" },
  { label: "Total Liabilities", field: "totalLiabilities", bold: true },
  { label: "EQUITY", field: "", section: "EQUITY" },
  { label: "Retained Earnings", field: "retainedEarnings" },
  { label: "Total Equity", field: "totalStockholdersEquity", bold: true },
];

const CASHFLOW_ROWS: RowDef[] = [
  { label: "OPERATING", field: "", section: "OPERATING" },
  { label: "Net Income", field: "netIncome" },
  { label: "D&A", field: "depreciationAndAmortization" },
  { label: "Stock Comp", field: "stockBasedCompensation" },
  { label: "Operating Cash Flow", field: "operatingCashFlow", bold: true },
  { label: "INVESTING", field: "", section: "INVESTING" },
  { label: "Capital Expenditures", field: "capitalExpenditure", invertColor: true },
  { label: "Acquisitions", field: "acquisitionsNet" },
  { label: "Investing Cash Flow", field: "investingCashFlow", bold: true },
  { label: "FINANCING", field: "", section: "FINANCING" },
  { label: "Dividends Paid", field: "dividendsPaid" },
  { label: "Share Repurchases", field: "commonStockRepurchased" },
  { label: "Debt Repaid", field: "debtRepayment" },
  { label: "Financing Cash Flow", field: "financingCashFlow", bold: true },
  { label: "FREE CASH FLOW", field: "", section: "FREE CASH FLOW" },
  { label: "Free Cash Flow", field: "freeCashFlow", bold: true },
  { label: "Net Change in Cash", field: "netChangeInCash" },
];

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}
const fmtEps = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `$${v.toFixed(2)}`;

function FinancialsInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "AAPL");
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const [tab, setTab] = useState<"income" | "balance" | "cashflow">("income");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);

  async function load(sym?: string, p?: "annual" | "quarterly") {
    const t = (sym ?? input).trim().toUpperCase();
    const per = p ?? period;
    if (!t) return;
    setInput(t); setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ms-financials/${t}?period=${per}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed"); setData(null);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    load(search.get("ticker") ?? "AAPL", "annual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchPeriod(p: "annual" | "quarterly") {
    setPeriod(p);
    if (data?.ticker) load(data.ticker, p);
  }

  const ROWS = tab === "income" ? INCOME_ROWS : tab === "balance" ? BALANCE_ROWS : CASHFLOW_ROWS;
  const periods: { date: string; label: string }[] = data?.periods ?? [];
  const rows: Record<string, (number | null)[]> = data?.rows ?? {};

  const tabs: { key: "income" | "balance" | "cashflow"; label: string }[] = [
    { key: "income", label: "Income Statement" },
    { key: "balance", label: "Balance Sheet" },
    { key: "cashflow", label: "Cash Flow" },
  ];

  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent-gold)" : "var(--bg-elevated)",
    color: active ? "var(--on-accent)" : "var(--text-secondary)",
    border: "1px solid var(--border)", borderRadius: 22,
    padding: "6px 15px", fontSize: "0.72rem", fontWeight: 600,
    cursor: "pointer", fontFamily: SANS,
  });

  return (
    <div style={{ paddingBottom: "4rem", fontFamily: SANS, color: "var(--text-primary)" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Financials
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Income statement · Balance sheet · Cash flow — annual &amp; quarterly, as filed with the SEC
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); inputRef.current?.blur(); }}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: "1.2rem" }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Type a ticker…" required
          style={{
            width: 160, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 22, padding: "9px 14px", color: "var(--text-primary)",
            fontFamily: MONO, fontSize: "0.85rem", outline: "none",
          }} />
        <button type="submit" disabled={loading} style={{
          background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22,
          padding: "9px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}>{loading ? "Loading…" : "Load"}</button>

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button type="button" onClick={() => switchPeriod("annual")} style={chip(period === "annual")}>Annual</button>
          <button type="button" onClick={() => switchPeriod("quarterly")} style={chip(period === "quarterly")}>Quarterly</button>
        </div>
      </form>

      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem", marginBottom: 16 }}>{error}</div>}

      {data && !loading && periods.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
            <CompanyLogo ticker={data.ticker} size={38} />
            <span style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 600 }}>{data.name}</span>
            <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--text-muted)" }}>
              CIK {Number(data.cik)} · {periods.length} periods
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.1rem" }}>
            {tabs.map((tb) => (
              <button key={tb.key} onClick={() => setTab(tb.key)} style={chip(tab === tb.key)}>{tb.label}</button>
            ))}
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 22 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{
                    textAlign: "left", padding: "10px 14px", fontFamily: SANS, fontSize: "0.58rem",
                    fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
                    color: "var(--text-secondary)", borderBottom: "1px solid var(--border)",
                    minWidth: 190, position: "sticky", left: 0, background: "var(--bg-primary)",
                  }}>Line Item</th>
                  {periods.map((p) => (
                    <th key={p.date} style={{
                      textAlign: "right", padding: "10px 14px", fontFamily: MONO, fontSize: "0.74rem",
                      fontWeight: 700, color: "var(--accent-gold)",
                      borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                    }}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => {
                  if (row.section) {
                    return (
                      <tr key={row.section} style={{ background: "var(--bg-elevated)" }}>
                        <td colSpan={periods.length + 1} style={{
                          padding: "6px 14px", fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600,
                          textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)",
                        }}>{row.section}</td>
                      </tr>
                    );
                  }
                  const vals = rows[row.field] ?? [];
                  const allEmpty = vals.every((v) => v == null);
                  return (
                    <tr key={row.label} style={{ background: ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                      <td style={{
                        padding: "8px 14px", fontFamily: SANS, fontSize: "0.76rem",
                        fontWeight: row.bold ? 700 : 400,
                        color: allEmpty ? "var(--text-muted)" : "var(--text-primary)",
                        borderBottom: "1px solid var(--border)",
                        position: "sticky", left: 0,
                        background: ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)",
                      }}>{row.label}</td>
                      {allEmpty ? (
                        <td colSpan={periods.length} style={{
                          textAlign: "right", padding: "8px 14px", borderBottom: "1px solid var(--border)",
                          fontFamily: SANS, fontSize: "0.68rem", fontWeight: 600, color: "var(--accent-gold)",
                        }}>
                          Not tagged in this filer&apos;s XBRL
                        </td>
                      ) : (
                        vals.map((v, i) => {
                          const negative = v != null && v < 0;
                          const tone = negative !== !!row.invertColor ? "var(--negative)" : "var(--text-primary)";
                          return (
                            <td key={periods[i]?.date ?? i} style={{
                              textAlign: "right", padding: "8px 14px",
                              borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                              fontWeight: row.bold ? 600 : 400,
                              color: v == null ? "var(--text-muted)" : negative ? tone : "var(--text-primary)",
                            }}>
                              {row.isEps ? fmtEps(v) : fmtMoney(v)}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "1rem", lineHeight: 1.6 }}>
            Source: SEC EDGAR XBRL company facts, as filed on 10-K and 10-Q. Quarterly cash-flow figures are
            un-cumulated from the year-to-date tagging filers use, and fourth quarters are reconstructed from
            the annual total. EBITDA is not a GAAP line — it is operating income plus D&amp;A. Rows a company
            doesn&apos;t tag are marked rather than shown as zero.{" "}
            <Link href={`/ms/charts?ticker=${data.ticker}`} style={{ color: "var(--accent-gold)" }}>
              See these charted →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function MsFinancialsPage() {
  return <Suspense fallback={null}><FinancialsInner /></Suspense>;
}
