import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Congress Trades — STOCK Act Disclosures",
  description:
    "Stock trades disclosed by sitting members of Congress, parsed from House and Senate periodic transaction reports: who traded what, when, and how long they took to report it.",
  alternates: { canonical: "/congress" },
  openGraph: {
    title: "Congress Trades — STOCK Act Disclosures · Prometheon Engine",
    description:
      "Stock trades disclosed by sitting members of Congress, parsed from House and Senate periodic transaction reports: who traded what, when, and how long they took to report it.",
    url: "https://prometheonengine.com/congress",
  },
};

export default function CongressLayout({ children }: { children: React.ReactNode }) {
  return children;
}
