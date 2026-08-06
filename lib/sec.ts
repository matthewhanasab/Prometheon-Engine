const HEADERS = { "User-Agent": "Prometheon Engine research_tool matthanasab@gmail.com" };

async function secGet(url: string) {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function parseForm4Xml(xml: string) {
  const getText = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>\\s*(?:<value>)?([^<]+?)(?:</value>)?\\s*</${tag}>`, "i"));
    return m?.[1]?.trim() ?? "";
  };
  const name = getText("rptOwnerName") || "Unknown";
  let title = getText("officerTitle") || getText("otherText") || "";
  if (!title) {
    if (getText("isDirector") === "1") title = "Director";
    else if (getText("isOfficer") === "1") title = "Officer";
    else if (getText("is10PercentOwner") === "1") title = "10% Owner";
  }

  const rows: any[] = [];
  const ndtMatches = xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi);
  for (const m of ndtMatches) {
    const block = m[1];
    const getField = (t: string) => {
      const fm = block.match(new RegExp(`<${t}[^>]*>\\s*(?:<value>)?([^<]+?)(?:</value>)?\\s*</${t}>`, "i"));
      return fm?.[1]?.trim() ?? "";
    };
    const acq    = getField("transactionAcquiredDisposedCode");
    const shares = parseFloat(getField("transactionShares") || "0");
    const price  = parseFloat(getField("transactionPricePerShare") || "0");
    const date   = getField("transactionDate");
    const owned  = parseFloat(getField("sharesOwnedFollowingTransaction") || "0");
    if (!shares || shares <= 0) continue;
    rows.push({
      date,
      name: name.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "),
      title: title || "—",
      type: acq === "A" ? "BUY" : acq === "D" ? "SELL" : "OTHER",
      shares,
      price: price || null,
      value: price ? Math.round(shares * price) : null,
      owned: owned || null,
    });
  }
  return rows;
}

export async function getInsiderTrades(ticker: string) {
  try {
    const tickerData = await secGet("https://www.sec.gov/files/company_tickers.json");
    if (!tickerData) return [];
    let cikStr: string | null = null;
    for (const entry of Object.values(tickerData) as any[]) {
      if ((entry.ticker ?? "").toUpperCase() === ticker.toUpperCase()) {
        cikStr = String(entry.cik_str);
        break;
      }
    }
    if (!cikStr) return [];
    const cik10 = cikStr.padStart(10, "0");
    const subs = await secGet(`https://data.sec.gov/submissions/CIK${cik10}.json`);
    if (!subs) return [];

    const recent   = subs.filings?.recent ?? {};
    const forms    = recent.form ?? [];
    const dates    = recent.filingDate ?? [];
    const accnums  = recent.accessionNumber ?? [];
    const docs     = recent.primaryDocument ?? [];
    const idxs     = forms.map((f: string, i: number) => f === "4" ? i : -1).filter((i: number) => i >= 0).slice(0, 20);
    const cikInt   = parseInt(cikStr);

    const all: any[] = [];
    for (const idx of idxs) {
      try {
        const acc = accnums[idx].replace(/-/g, "");
        // primaryDocument often points at the XSL-rendered view
        // (xslF345X06/form4.xml) which serves HTML — strip the prefix to get
        // the raw XML the parser needs.
        const doc = String(docs[idx]).replace(/^xsl[^/]*\//i, "");
        const fd  = dates[idx];
        const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}/${doc}`;
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) continue;
        const xml = await res.text();
        const txns = parseForm4Xml(xml);
        txns.forEach(t => { if (!t.date) t.date = fd; });
        all.push(...txns);
      } catch { continue; }
    }
    return all.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  } catch { return []; }
}

export async function getSecFilings(ticker: string) {
  try {
    const tickerData = await secGet("https://www.sec.gov/files/company_tickers.json");
    if (!tickerData) return [];
    let cikStr: string | null = null;
    for (const entry of Object.values(tickerData) as any[]) {
      if ((entry.ticker ?? "").toUpperCase() === ticker.toUpperCase()) {
        cikStr = String(entry.cik_str);
        break;
      }
    }
    if (!cikStr) return [];
    const cik10   = cikStr.padStart(10, "0");
    const cikInt  = parseInt(cikStr);
    const subs    = await secGet(`https://data.sec.gov/submissions/CIK${cik10}.json`);
    if (!subs) return [];

    const recent      = subs.filings?.recent ?? {};
    const forms       = recent.form           ?? [];
    const dates       = recent.filingDate      ?? [];
    const accnums     = recent.accessionNumber ?? [];
    const primaryDocs = recent.primaryDocument ?? [];
    const descriptions= recent.primaryDocDescription ?? [];

    const results: { date: string; form: string; description: string; url: string }[] = [];

    const limit = Math.min(forms.length, 30);
    for (let i = 0; i < limit; i++) {
      const acc     = (accnums[i] ?? "").replace(/-/g, "");
      const doc     = primaryDocs[i] ?? "";
      const url     = doc
        ? `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}/${doc}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikInt}&type=${forms[i]}&dateb=&owner=include&count=40`;
      results.push({
        date:        dates[i]        ?? "",
        form:        forms[i]        ?? "",
        description: descriptions[i] ?? "",
        url,
      });
    }

    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}
