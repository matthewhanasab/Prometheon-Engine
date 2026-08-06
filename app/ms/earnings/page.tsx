"use client";
import MsNav from "@/components/MsNav";
import TradingViewWidget from "@/components/TradingViewWidget";

// Earnings, Market Stack edition.
//
// marketstack has neither an earnings calendar nor the estimate side of
// surprises. TradingView's events widget carries the upcoming calendar with
// consensus vs reported, which covers the calendar half of this page. Historic
// reported EPS still comes from EDGAR on the Charts page.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";

export default function MsEarningsPage() {
  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Earnings &amp; Economic Calendar
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 240, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Upcoming releases with consensus vs actual, via the TradingView events widget.
      </div>

      <TradingViewWidget
        widget="events"
        height={620}
        config={{ importanceFilter: "-1,0,1", countryFilter: "us,eu,gb,jp,cn" }}
      />

      <div style={{
        background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 22,
        padding: "16px 20px", marginTop: 16, fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6,
      }}>
        <strong style={{ color: "var(--accent-gold)" }}>Partially available.</strong> The calendar works, but the
        main site&apos;s per-ticker earnings-surprise history (reported vs estimated, quarter by quarter) needs
        analyst estimates — which marketstack doesn&apos;t carry at any tier, and which can&apos;t be read out of a
        TradingView widget. Reported EPS by fiscal year is charted from SEC filings on this edition&apos;s Charts page.
      </div>
    </div>
  );
}
