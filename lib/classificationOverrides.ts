// Manual sector/industry corrections for tickers our data providers misclassify.
// FMP (and Finnhub) lag reality on companies that pivoted — e.g. bitcoin miners
// turned AI-datacenter operators still labeled "Information Technology Services".
// Add entries as users report them; these win over provider data on display.
export const CLASSIFICATION_OVERRIDES: Record<string, { sector?: string; industry?: string }> = {
  IREN: { sector: "Technology", industry: "Bitcoin Mining & AI Data Centers" },
  MARA: { industry: "Bitcoin Mining" },
  RIOT: { industry: "Bitcoin Mining" },
  CLSK: { industry: "Bitcoin Mining" },
  WULF: { industry: "Bitcoin Mining & HPC Hosting" },
  HUT:  { industry: "Bitcoin Mining & HPC Hosting" },
  CIFR: { industry: "Bitcoin Mining & AI Data Centers" },
  CORZ: { industry: "Bitcoin Mining & AI Data Centers" },
};

export function applyClassificationOverride<T extends { ticker?: string; sector?: string | null; industry?: string | null }>(stock: T): T {
  const o = stock.ticker ? CLASSIFICATION_OVERRIDES[stock.ticker.toUpperCase()] : undefined;
  if (!o) return stock;
  return { ...stock, ...(o.sector ? { sector: o.sector } : {}), ...(o.industry ? { industry: o.industry } : {}) };
}
