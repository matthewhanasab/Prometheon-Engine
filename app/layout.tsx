import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SiteFooter from "@/components/SiteFooter";
import CommandMenu from "@/components/CommandMenu";
import ScrollMemory from "@/components/ScrollMemory";
import AccessibilityWidget from "@/components/AccessibilityWidget";

// viewport-fit=cover lets the page paint under the notch and home indicator;
// the fixed bars pad themselves back out with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://prometheonengine.com"),
  title: {
    default: "Prometheon Engine — Free Stock Research & Financial Analysis",
    template: "%s · Prometheon Engine",
  },
  description:
    "Free stock research and analysis: fundamentals, valuation, financial statements, dividend history, SEC filings, insider trades, earnings, and options screeners — every number that matters in one place.",
  applicationName: "Prometheon Engine",
  keywords: [
    "stock research", "stock analysis", "financial statements", "stock valuation",
    "dividend history", "SEC filings", "insider trading", "earnings calendar",
    "options screener", "covered calls", "cash-secured puts", "stock screener",
    "P/E ratio", "free cash flow", "compare stocks",
  ],
  authors: [{ name: "Prometheon Engine" }],
  creator: "Prometheon Engine",
  category: "finance",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    title: "Prometheon Engine — Free Stock Research & Financial Analysis",
    description: "Every number that matters. One software. Fundamentals, valuation, statements, dividends, SEC filings, and options — free.",
    url: "https://prometheonengine.com",
    siteName: "Prometheon Engine",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Prometheon Engine — stock research platform" }],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prometheon Engine — Free Stock Research & Financial Analysis",
    description: "Every number that matters. One software.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Browser chrome colour. The theme is a saved choice, not the OS
            setting, so the script below keeps this in step with it. */}
        <meta name="theme-color" id="theme-color" content="#0C1220" />
        {/* Structured data: Organization + WebSite (with a sitelinks search box
            targeting ticker research) + WebApplication for rich results. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://prometheonengine.com/#org",
                  name: "Prometheon Engine",
                  url: "https://prometheonengine.com",
                  logo: "https://prometheonengine.com/logo_icon_sq.png",
                },
                {
                  "@type": "WebSite",
                  "@id": "https://prometheonengine.com/#website",
                  url: "https://prometheonengine.com",
                  name: "Prometheon Engine",
                  description: "Free stock research and financial analysis.",
                  publisher: { "@id": "https://prometheonengine.com/#org" },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate: "https://prometheonengine.com/research?ticker={ticker}",
                    },
                    "query-input": "required name=ticker",
                  },
                },
                {
                  "@type": "WebApplication",
                  name: "Prometheon Engine",
                  url: "https://prometheonengine.com",
                  applicationCategory: "FinanceApplication",
                  operatingSystem: "Web",
                  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                  description:
                    "Stock research: fundamentals, valuation, financial statements, dividends, SEC filings, insider trades, earnings, and options screeners.",
                },
              ],
            }),
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Schibsted+Grotesk:wght@500;600&family=Spline+Sans+Mono:wght@400;500;600;700&family=Public+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {/* Apply saved theme before first paint (no flash). Dark is the default
            for a first-time visitor; an explicit choice is remembered either way. */}
        <script dangerouslySetInnerHTML={{ __html: `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t !== "dark" && t !== "light") t = "dark";
    document.documentElement.dataset.theme = t;
    var m = document.getElementById("theme-color");
    if (m) m.setAttribute("content", t === "dark" ? "#0C1220" : "#D6D8DD");
  } catch (e) { document.documentElement.dataset.theme = "dark"; }
})();
        ` }} />
        {/* Object-design + dark theme rules injected directly: the Tailwind pipeline drops these from globals.css */}
        <style dangerouslySetInnerHTML={{ __html: `
button { border-radius: 999px !important; text-transform: none !important; letter-spacing: 0.01em !important; }
input, select { border-radius: 999px !important; padding-left: 1.1rem !important; padding-right: 1.1rem !important; }
.logo-on-dark { display: none; }
:root[data-theme="dark"] .logo-on-dark { display: inline-block; }
:root[data-theme="dark"] .logo-on-light { display: none; }

/* Accessibility preferences (set by AccessibilityWidget) */
html[data-a11y-text="lg"] { font-size: clamp(18.4px, 1.44vw, 23px) !important; }
html[data-a11y-text="xl"] { font-size: clamp(20.8px, 1.63vw, 26px) !important; }
html[data-a11y-links="underline"] a { text-decoration: underline !important; text-underline-offset: 2px; }
html[data-a11y-motion="reduce"] *,
html[data-a11y-motion="reduce"] *::before,
html[data-a11y-motion="reduce"] *::after {
  animation: none !important; transition: none !important; scroll-behavior: auto !important;
}
:root[data-a11y-contrast="high"] {
  --text-secondary: #33384A;
  --text-muted:     #3F4554;
  --border:         rgba(35, 40, 55, 0.32);
}
:root[data-theme="dark"][data-a11y-contrast="high"] {
  --text-secondary: #C7D2E5;
  --text-muted:     #A9B6CC;
  --border:         rgba(255, 255, 255, 0.24);
}
html[data-a11y-spacing="wide"] body { letter-spacing: 0.08em !important; word-spacing: 0.16em !important; }
html[data-a11y-lineheight="tall"] body p,
html[data-a11y-lineheight="tall"] body div,
html[data-a11y-lineheight="tall"] body span,
html[data-a11y-lineheight="tall"] body a,
html[data-a11y-lineheight="tall"] body td,
html[data-a11y-lineheight="tall"] body li { line-height: 1.9 !important; }
html[data-a11y-images="hide"] img { visibility: hidden !important; }
html[data-a11y-dyslexia="on"] body,
html[data-a11y-dyslexia="on"] body * { font-family: Verdana, Tahoma, "Trebuchet MS", sans-serif !important; }
html[data-a11y-saturation="low"] body { filter: saturate(0.25); }
html[data-a11y-cursor="big"], html[data-a11y-cursor="big"] * {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l16 11.5-6.6.9 3.8 6.7-3 1.7-3.8-6.8-4.9 4.5z' fill='white' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E") 3 2, auto !important;
}


:root[data-theme="dark"] {
  --bg-primary:    #0C1220;
  --bg-surface:    rgba(255, 255, 255, 0.045);
  --bg-elevated:   rgba(255, 255, 255, 0.08);
  --border:        rgba(255, 255, 255, 0.10);
  --border-active: rgba(107, 156, 255, 0.40);
  --accent-gold:   #6B9CFF;
  --accent-2:      #4FD1E8;
  --accent-rgb:    107, 156, 255;
  --on-accent:     #071021;
  --text-primary:  #EDF2FA;
  --text-secondary:#93A2BC;
  --text-muted:    #8391AB;
  --positive:      #4ADE80;
  --negative:      #F87171;
  --tick:          #93A2BC;
  --tooltip-bg:    rgba(16, 24, 42, 0.96);
  --tooltip-border:rgba(107, 156, 255, 0.35);
  --cursor-fill:   rgba(107, 156, 255, 0.10);
  --glow-a:        rgba(80, 120, 220, 0.14);
  --glow-b:        rgba(90, 130, 230, 0.10);
  --bg-g1:         #101828;
  --bg-g2:         #0C1220;
  --bg-g3:         #0A0F1B;
  --card-shadow:   0 16px 40px rgba(0, 0, 0, 0.40);
  --glass-inset:   inset 0 1px 0 rgba(255, 255, 255, 0.07);
  --bar-bg:        rgba(12, 18, 32, 0.80);
  --scrim:         rgba(2, 6, 14, 0.58);
  --surface-solid: #171D2A;
  --series-1:      #5A8DEE;
  --series-2:      #D9692F;
  --series-3:      #22A5BA;
  --series-4:      #C98500;
  --series-5:      #D55181;
  --series-6:      #8F84E8;
}
        ` }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <Sidebar />
        <main id="main" tabIndex={-1} className="main-content">
          {children}
          <SiteFooter />
        </main>
        <CommandMenu />
        <ScrollMemory />
        <AccessibilityWidget />
      </body>
    </html>
  );
}
