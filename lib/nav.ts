// The site's navigation, defined once. The top bar, the phone drawer, the
// search menu and the footers all read from here, so a page can never be in
// one and missing from another (the drawer used to lack three pages).

export type NavItem = {
  href: string;
  label: string;
  /** One line for the search menu and the landing page. */
  hint: string;
  /** When set, the page takes a ticker and the search menu can open it for one. */
  tickerParam?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Research",
    items: [
      { href: "/research",    label: "Stock Research",       hint: "Valuation, quality, analysts and ownership for one company", tickerParam: "ticker" },
      { href: "/compare",     label: "Compare Stocks",       hint: "Up to five companies side by side" },
      { href: "/charts",      label: "Financial Charts",     hint: "Revenue, margins, earnings and cash flow over time", tickerParam: "ticker" },
      { href: "/financials",  label: "Financial Statements", hint: "Income statement, balance sheet and cash flow", tickerParam: "ticker" },
      { href: "/projections", label: "Projections",          hint: "Bull, base and bear five-year scenarios", tickerParam: "ticker" },
    ],
  },
  {
    label: "Markets",
    items: [
      { href: "/earnings",  label: "Earnings Calendar", hint: "Who reports this week and what analysts expect" },
      { href: "/screener",  label: "Screener",          hint: "Filter the market by sector, size and valuation" },
      { href: "/movers",    label: "Market Movers",     hint: "Gainers, losers and the sector heatmap" },
      { href: "/macro",     label: "Macro Dashboard",   hint: "Rates, inflation, the yield curve and sentiment" },
      { href: "/dividends", label: "Dividends",         hint: "Payment history, yield and growth", tickerParam: "ticker" },
    ],
  },
  {
    label: "ETFs & Options",
    items: [
      { href: "/etf",           label: "ETF Hub",                 hint: "Holdings, sectors and concentration for a fund" },
      { href: "/etf/compare",   label: "Compare ETFs",            hint: "Holdings overlap and returns between funds" },
      { href: "/options-chain", label: "Options Chain",           hint: "Quotes, implied volatility and Greeks", tickerParam: "ticker" },
      { href: "/covered-calls", label: "Covered Call Calculator", hint: "Premium income strike by strike", tickerParam: "ticker" },
    ],
  },
  {
    label: "Smart Money",
    items: [
      { href: "/mna",      label: "M&A Activity",    hint: "Acquisitions, buyouts and IPOs by industry" },
      { href: "/congress", label: "Congress Trades", hint: "Stock trades disclosed by members of Congress" },
      { href: "/insider",  label: "Insider Trading", hint: "SEC Form 4 purchases and sales by executives" },
      { href: "/sec",      label: "SEC Filings",     hint: "10-Ks, 10-Qs and 8-Ks straight from EDGAR", tickerParam: "ticker" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/calculator",    label: "Compound Calculator", hint: "What steady investing does over decades" },
      { href: "/about",         label: "About",               hint: "What this is, how it works and where the data comes from" },
      { href: "/accessibility", label: "Accessibility",       hint: "Display options and the accessibility statement" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Desktop top bar: three direct tabs, then the remaining pages in menus.
export const TOP_DIRECT: { href: string; label: string }[] = [
  { href: "/research", label: "Research" },
  { href: "/compare",  label: "Compare" },
  { href: "/charts",   label: "Charts" },
];

const pick = (...hrefs: string[]) => hrefs.map((h) => NAV_ITEMS.find((i) => i.href === h)!).filter(Boolean);

export const TOP_MENUS: NavGroup[] = [
  { label: "Analysis",    items: pick("/financials", "/projections", "/earnings", "/dividends", "/screener") },
  { label: "ETFs",        items: pick("/etf", "/etf/compare") },
  { label: "Options",     items: pick("/options-chain", "/covered-calls") },
  { label: "Smart Money", items: pick("/mna", "/congress", "/insider", "/sec") },
  { label: "More",        items: pick("/macro", "/movers", "/calculator", "/about") },
];

export const GITHUB_URL = "https://github.com/matthewhanasab/Prometheon-Engine";

/** True when `href` is the current page or a parent of it. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // "/etf" must not light up on "/etf/compare".
  if (href === "/etf") return pathname === "/etf";
  return pathname === href || pathname.startsWith(href + "/");
}
