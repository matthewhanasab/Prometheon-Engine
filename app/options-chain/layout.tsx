import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Options Chain — Quotes, IV & Greeks",
  description:
    "Full options chain for any listed US stock: bid/ask, volume, open interest, implied volatility and exchange-published greeks for every strike and expiry.",
  alternates: { canonical: "/options-chain" },
  openGraph: {
    title: "Options Chain — Quotes, IV & Greeks · Prometheon Engine",
    description:
      "Full options chain for any listed US stock: bid/ask, volume, open interest, implied volatility and exchange-published greeks for every strike and expiry.",
    url: "https://prometheonengine.com/options-chain",
  },
};

export default function OptionsChainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
