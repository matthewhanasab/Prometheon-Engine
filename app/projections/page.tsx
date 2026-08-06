import NotAvailable from "@/components/NotAvailable";

export default function ProjectionsPage() {
  return (
    <NotAvailable
      title="Projections"
      reason="Projections are built from analyst forward estimates — EPS, revenue and growth forecasts. No current provider carries estimate data. Historical growth rates, computed from SEC filings, are on the Charts and Earnings pages."
      alt={{ href: "/charts", label: "Historical growth on Charts →" }}
    />
  );
}
