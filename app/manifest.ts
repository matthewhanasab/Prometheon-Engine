import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prometheon Engine — Stock Research & Analysis",
    short_name: "Prometheon",
    description:
      "Free stock research: fundamentals, valuation, financial statements, dividends, SEC filings, insider trades, and options screeners.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C1220",
    theme_color: "#0C1220",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/logo_icon_sq.png", sizes: "512x512", type: "image/png" },
      { src: "/logo_icon.png", sizes: "192x192", type: "image/png" },
    ],
  };
}
