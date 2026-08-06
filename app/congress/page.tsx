import NotAvailable from "@/components/NotAvailable";

export default function CongressPage() {
  return (
    <NotAvailable
      title="Congress Trades"
      reason="Congressional trading disclosures aren't machine-readable from the official sources: the House Clerk archive is a filing index only, the actual trades exist inside scanned (often handwritten) PDFs, and the Senate portal is session-gated. Extracting them reliably needs an OCR pipeline or a paid provider with unclear redistribution terms — neither fits the current stack."
      alt={{ href: "/insider", label: "Insider trading (Form 4) →" }}
    />
  );
}
