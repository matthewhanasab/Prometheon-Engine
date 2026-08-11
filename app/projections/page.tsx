import NotAvailable from "@/components/NotAvailable";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projections",
  description: "Analyst forward projections. Not currently available on Prometheon Engine.",
  robots: { index: false, follow: true },
};


export default function ProjectionsPage() {
  return (
    <NotAvailable
      title="Projections"
      reason="Projections are built from analyst forward estimates — EPS, revenue and growth forecasts. No current provider carries estimate data. Historical growth rates, computed from SEC filings, are on the Charts and Earnings pages."
      alt={{ href: "/charts", label: "Historical growth on Charts →" }}
    />
  );
}
