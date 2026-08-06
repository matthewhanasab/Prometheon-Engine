"use client";
import { Suspense } from "react";
import MsNav from "@/components/MsNav";
import { CoveredCallsInner } from "@/app/covered-calls/page";

// Covered Calls, Market Stack edition — the same page component as the main
// site, pointed at an endpoint built on marketstack + FRED + SEC EDGAR.
// Nothing about the analysis changes: strikes, premiums, greeks and assignment
// probabilities were always modelled locally from Black-Scholes.
export default function MsCoveredCallsPage() {
  return (
    <Suspense fallback={null}>
      <MsNav />
      <CoveredCallsInner apiBase="/api/ms-options" />
    </Suspense>
  );
}
