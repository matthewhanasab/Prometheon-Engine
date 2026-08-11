import NotAvailable from "@/components/NotAvailable";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ETF Hub",
  description: "ETF holdings and sector weights. Not currently available on Prometheon Engine.",
  robots: { index: false, follow: true },
};


export default function EtfPage() {
  return (
    <NotAvailable
      title="ETF Hub"
      reason="Fund holdings, sector weights and expense-ratio data need an ETF dataset the current providers don't serve — marketstack's etfholdings endpoint returns no data even for SPY (raised with their support). Prices and dividends for any ETF ticker still work everywhere else on the site."
      alt={{ href: "/research?ticker=SPY", label: "Research an ETF ticker →" }}
    />
  );
}
