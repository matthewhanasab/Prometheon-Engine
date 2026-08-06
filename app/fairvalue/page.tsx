import NotAvailable from "@/components/NotAvailable";

export default function FairValuePage() {
  return (
    <NotAvailable
      title="Fair Value Graph"
      reason="The Fair Value Graph plots price against analyst forward EPS estimates. No current provider carries estimate data — marketstack's ratings endpoint has price targets and buy/hold/sell calls, but not the EPS forecasts this page is built on. A DCF-based fair value computed from SEC filings is on the Research page instead."
      alt={{ href: "/research", label: "DCF fair value on Research →" }}
    />
  );
}
