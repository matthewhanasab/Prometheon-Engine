"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmtLarge(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}
function fmtEps(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}
function yoy(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current == null || prev == null || !isFinite(current) || !isFinite(prev) || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

// â”€â”€ Row definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type RowDef = {
  label: string;
  field: string;
  bold?: boolean;
  invertColor?: boolean; // cost rows: higher = red
  isEps?: boolean;
  section?: string; // if set, renders a section header before this row
};

const INCOME_ROWS: RowDef[] = [
  { label: "Revenue",          field: "revenue",                              bold: true },
  { label: "Cost of Revenue",  field: "costOfRevenue",                        invertColor: true },
  { label: "Gross Profit",     field: "grossProfit",                          bold: true },
  { label: "R&D",              field: "researchAndDevelopmentExpenses",        invertColor: true },
  { label: "SG&A",             field: "sellingGeneralAndAdministrativeExpenses", invertColor: true },
  { label: "Operating Income", field: "operatingIncome",                      bold: true },
  { label: "Interest Expense", field: "interestExpense",                      invertColor: true },
  { label: "Pre-Tax Income",   field: "incomeBeforeTax" },
  { label: "Income Tax",       field: "incomeTaxExpense",                     invertColor: true },
  { label: "Net Income",       field: "netIncome",                            bold: true },
  { label: "EBITDA",           field: "ebitda",                               bold: true },
  { label: "Diluted EPS",      field: "epsDiluted",                           isEps: true },
];

const BALANCE_ROWS: RowDef[] = [
  { label: "ASSETS", field: "", section: "ASSETS" },
  { label: "Cash & Equivalents",    field: "cashAndCashEquivalents" },
  { label: "Short-Term Investments",field: "shortTermInvestments" },
  { label: "Receivables",           field: "netReceivables" },
  { label: "Inventory",             field: "inventory" },
  { label: "Total Current Assets",  field: "totalCurrentAssets",  bold: true },
  { label: "PP&E net",              field: "propertyPlantEquipmentNet" },
  { label: "Goodwill & Intangibles",field: "goodwillAndIntangibleAssets" },
  { label: "Total Assets",          field: "totalAssets",          bold: true },
  { label: "LIABILITIES", field: "", section: "LIABILITIES" },
  { label: "Accounts Payable",      field: "accountPayables" },
  { label: "Short-Term Debt",       field: "shortTermDebt" },
  { label: "Total Current Liab.",   field: "totalCurrentLiabilities", bold: true },
  { label: "Long-Term Debt",        field: "longTermDebt" },
  { label: "Total Liabilities",     field: "totalLiabilities",    bold: true },
  { label: "EQUITY", field: "", section: "EQUITY" },
  { label: "Retained Earnings",     field: "retainedEarnings" },
  { label: "Total Equity",          field: "totalStockholdersEquity", bold: true },
];

const CASHFLOW_ROWS: RowDef[] = [
  { label: "OPERATING", field: "", section: "OPERATING" },
  { label: "Net Income",           field: "netIncome" },
  { label: "D&A",                  field: "depreciationAndAmortization" },
  { label: "Stock Comp",           field: "stockBasedCompensation" },
  { label: "Operating Cash Flow",  field: "operatingCashFlow",  bold: true },
  { label: "INVESTING", field: "", section: "INVESTING" },
  { label: "Capital Expenditures", field: "capitalExpenditure",  invertColor: true },
  { label: "Acquisitions",         field: "acquisitionsNet" },
  { label: "Investing Cash Flow",  field: "investingCashFlow",   bold: true },
  { label: "FINANCING", field: "", section: "FINANCING" },
  { label: "Dividends Paid",       field: "dividendsPaid" },
  { label: "Share Repurchases",    field: "commonStockRepurchased" },
  { label: "Debt Issued",          field: "debtRepayment" },
  { label: "Financing Cash Flow",  field: "financingCashFlow",   bold: true },
  { label: "FREE CASH FLOW", field: "", section: "FREE CASH FLOW" },
  { label: "Free Cash Flow",       field: "freeCashFlow",        bold: true },
  { label: "Net Change in Cash",   field: "netChangeInCash" },
];

// â”€â”€ Period label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function periodLabel(item: any, isQuarterly: boolean): string {
  const d = item.date ?? item.calendarYear ?? "";
  if (!d) return "—";
  if (isQuarterly) {
    const q = item.period ?? "";
    return `${q} ${String(d).slice(0, 4)}`;
  }
  return `FY ${String(d).slice(0, 4)}`;
}

// â”€â”€ FinancialsTable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FinancialsTable({ rows, data, isQuarterly }: {
  rows: RowDef[];
  data: any[];
  isQuarterly: boolean;
}) {
  if (!data || data.length === 0) return (
    <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", padding: "24px 0" }}>No data available.</div>
  );

  const periods = data.map(d => periodLabel(d, isQuarterly));

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr style={{ background: "var(--bg-primary)" }}>
            <th style={{
              textAlign: "left", padding: "9px 16px", fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase",
              letterSpacing: "0.12em", color: "var(--text-secondary)",
              borderBottom: "1px solid var(--border)", minWidth: 180, position: "sticky", left: 0,
              background: "var(--bg-primary)",
            }}>Line Item</th>
            {periods.map((p, i) => (
              <th key={i} style={{
                textAlign: "right", padding: "9px 14px",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.72rem", fontWeight: 600,
                color: "var(--accent-gold)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
              }}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            // Section header row
            if (row.section) {
              return (
                <tr key={`section-${row.section}`} style={{ background: "var(--bg-elevated)" }}>
                  <td
                    colSpan={periods.length + 1}
                    style={{
                      padding: "6px 16px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.58rem",
                      fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em",
                      color: "var(--text-secondary)", borderBottom: "1px solid var(--border)",
                    }}
                  >{row.section}</td>
                </tr>
              );
            }

            const values = data.map(d => d[row.field] ?? null);
            const bgEven = ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)";

            return (
              <tr key={row.label} style={{ background: bgEven }}>
                <td style={{
                  padding: "8px 16px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem",
                  color: "var(--text-primary)", fontWeight: row.bold ? 600 : undefined,
                  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                  position: "sticky", left: 0, background: bgEven,
                }}>
                  {row.label}
                </td>
                {values.map((val, ci) => {
                  const prev = values[ci + 1] ?? null;
                  const change = yoy(val, prev);
                  const isPositiveChange = change != null ? (row.invertColor ? change < 0 : change >= 0) : null;
                  const changeColor = isPositiveChange == null
                    ? "var(--text-muted)"
                    : isPositiveChange ? "var(--positive)" : "var(--negative)";

                  return (
                    <td key={ci} style={{
                      textAlign: "right", padding: "8px 10px 8px 0",
                      borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                        {change != null && ci < values.length - 1 && (
                          <span style={{
                            fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.65rem",
                            color: changeColor, minWidth: 52, textAlign: "right",
                          }}>
                            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                          </span>
                        )}
                        <span style={{
                          fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.80rem",
                          color: row.bold ? "var(--text-primary)" : "var(--text-secondary)",
                          fontWeight: row.bold ? 600 : undefined,
                          paddingRight: 14, minWidth: 90, textAlign: "right", display: "block",
                        }}>
                          {row.isEps ? fmtEps(val) : fmtLarge(val)}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FinancialsInner() {
  const searchParams = useSearchParams();
  const [input, setInput]     = useState("");
  const [period, setPeriod]   = useState<"annual" | "quarterly">("annual");
  const [activeTab, setActiveTab] = useState<"income" | "balance" | "cashflow">("income");
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [loadedTicker, setLoadedTicker] = useState("");

  async function fetchData(ticker: string, p: "annual" | "quarterly") {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/financials/${ticker.trim().toUpperCase()}?period=${p}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLoadedTicker(ticker.trim().toUpperCase());
    } catch {
      setError("Failed to load financials. Check the ticker and try again.");
    } finally { setLoading(false); }
  }

  async function load(e: React.FormEvent) {
    e.preventDefault();
    fetchData(input, period);
  }

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) { setInput(t.toUpperCase()); fetchData(t.toUpperCase(), period); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchPeriod(p: "annual" | "quarterly") {
    setPeriod(p);
    if (loadedTicker) fetchData(loadedTicker, p);
  }

  const tabs: { key: "income" | "balance" | "cashflow"; label: string }[] = [
    { key: "income",   label: "Income Statement" },
    { key: "balance",  label: "Balance Sheet" },
    { key: "cashflow", label: "Cash Flow" },
  ];

  return (
    <div style={{ paddingBottom: "4rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Financials
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "1.5rem", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        Income statement · Balance sheet · Cash flow — annual &amp; quarterly
      </div>

      {/* Search form */}
      <form onSubmit={load} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: "2rem" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="Ticker"
          required
          style={{
            width: 160, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "9px 14px", color: "var(--text-primary)",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.85rem", outline: "none",
          }}
        />

        {/* Period toggle */}
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
          {(["annual", "quarterly"] as const).map(p => (
            <label key={p} style={{
              padding: "9px 16px", cursor: "pointer",
              background: period === p ? "var(--accent-gold)" : "var(--bg-elevated)",
              color: period === p ? "#131C2E" : "var(--text-secondary)",
              fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem", fontWeight: period === p ? 700 : 400,
              textTransform: "capitalize", letterSpacing: "0.05em", transition: "all 0.15s",
            }}>
              <input type="radio" name="period" value={p} checked={period === p} onChange={() => switchPeriod(p)} style={{ display: "none" }} />
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </label>
          ))}
        </div>

        <button
          type="submit"
          style={{
            background: "var(--accent-gold)", color: "#131C2E", border: "none", borderRadius: 4,
            padding: "9px 22px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
          }}
        >Load</button>

        {loading && <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Loading {input}...</span>}
      </form>

      {error && <div style={{ color: "var(--negative)", fontSize: "0.82rem", marginBottom: 16 }}>{error}</div>}

      {!loading && !data && !error && (
        <div style={{ marginTop: "5rem", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.1rem", color: "var(--text-secondary)", marginBottom: 8 }}>Enter a ticker to view financials</div>
          <div style={{ fontSize: "0.70rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Prometheon Engine</div>
        </div>
      )}

      {data && (
        <>
          {/* Company name + period */}
          <div style={{ marginBottom: "1.25rem" }}>
            <span style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.3rem", color: "var(--text-primary)", marginRight: 12 }}>
              {data.name ?? loadedTicker}
            </span>
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.68rem", fontWeight: 600,
              background: "rgba(212,180,94,0.15)", color: "var(--accent-gold)",
              border: "1px solid rgba(212,180,94,0.3)", borderRadius: 3, padding: "2px 8px",
            }}>
              {period === "annual" ? "Annual · 5 years" : "Quarterly · 8 quarters"}
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "10px 22px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem",
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
                  border: "none", borderBottom: activeTab === tab.key ? "2px solid var(--accent-gold)" : "2px solid transparent",
                  background: "transparent",
                  color: activeTab === tab.key ? "var(--accent-gold)" : "var(--text-secondary)",
                  marginBottom: -1,
                  transition: "color 0.15s",
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "income" && (
            <FinancialsTable rows={INCOME_ROWS} data={data.income} isQuarterly={period === "quarterly"} />
          )}
          {activeTab === "balance" && (
            <FinancialsTable rows={BALANCE_ROWS} data={data.balance} isQuarterly={period === "quarterly"} />
          )}
          {activeTab === "cashflow" && (
            <FinancialsTable rows={CASHFLOW_ROWS} data={data.cashflow} isQuarterly={period === "quarterly"} />
          )}

          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 10 }}>
            YoY % change shown left of each value · Green = improved · Red = worsened
          </div>
        </>
      )}
    </div>
  );
}

export default function FinancialsPage() {
  return <Suspense fallback={null}><FinancialsInner /></Suspense>;
}
