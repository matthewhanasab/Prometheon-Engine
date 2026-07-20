import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AccessibilityWidget from "@/components/AccessibilityWidget";

export const metadata: Metadata = {
  metadataBase: new URL("https://prometheonengine.com"),
  title: "Prometheon Engine",
  description: "Every number that matters. One software. Stock research, portfolio tracking, options screeners, congress trades, and more.",
  openGraph: {
    title: "Prometheon Engine",
    description: "Every number that matters. One software.",
    url: "https://prometheonengine.com",
    siteName: "Prometheon Engine",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Prometheon Engine" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prometheon Engine",
    description: "Every number that matters. One software.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600;700&family=Public+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {/* Apply saved theme before first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t !== "dark" && t !== "light") t = "light";
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = "light"; }
})();
        ` }} />
        {/* Object-design + dark theme rules injected directly: the Tailwind pipeline drops these from globals.css */}
        <style dangerouslySetInnerHTML={{ __html: `
button { border-radius: 999px !important; text-transform: none !important; letter-spacing: 0.01em !important; }
input, select { border-radius: 999px !important; padding-left: 1.1rem !important; padding-right: 1.1rem !important; }
[style*="border:1px solid var(--border)"] {
  backdrop-filter: blur(22px) saturate(1.35);
  -webkit-backdrop-filter: blur(22px) saturate(1.35);
  box-shadow: var(--card-shadow), var(--glass-inset);
  background-image: var(--glass-sheen) !important;
}
tr[style*="border:1px solid var(--border)"],
td[style*="border:1px solid var(--border)"],
th[style*="border:1px solid var(--border)"] {
  backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; background-image: none !important;
}

.logo-on-dark { display: none; }
:root[data-theme="dark"] .logo-on-dark { display: inline-block; }
:root[data-theme="dark"] .logo-on-light { display: none; }

/* Room for the fixed brand bar the Sidebar renders on app pages */
html[data-topbar="1"] .main-content { padding-top: 5.9rem !important; }
@media (max-width: 767px) {
  html[data-topbar="1"] .main-content { padding-top: 4.6rem !important; }
}

/* Left-edge nav tab: a slow beacon pulse so people notice it's the way around */
@keyframes navTabPulse {
  0%, 100% { box-shadow: 3px 0 14px rgba(0,0,0,0.22), 0 0 0 0 rgba(var(--accent-rgb), 0.55); }
  50%      { box-shadow: 3px 0 14px rgba(0,0,0,0.22), 0 0 0 9px rgba(var(--accent-rgb), 0); }
}
.nav-edge-tab { animation: navTabPulse 2.6s ease-in-out infinite; }
.nav-edge-tab:hover { animation: none; }
@media (prefers-reduced-motion: reduce) { .nav-edge-tab { animation: none !important; } }

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
  --text-secondary: #3A3F4C;
  --text-muted:     #555B69;
  --border:         rgba(35, 40, 55, 0.32);
}
:root[data-theme="dark"][data-a11y-contrast="high"] {
  --text-secondary: #C7D2E5;
  --text-muted:     #9AA8C0;
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

/* Fair Value Graph series (validated per-surface) */
:root {
  --fv-line:     #BC5F04;
  --fv-fill:     rgba(24, 154, 85, 0.22);
  --fv-fill-est: rgba(24, 154, 85, 0.10);
  --fv-top:      rgba(24, 154, 85, 0.12);
}
:root[data-theme="dark"] {
  --fv-line:     #F09A4A;
  --fv-fill:     rgba(74, 222, 128, 0.16);
  --fv-fill-est: rgba(74, 222, 128, 0.07);
  --fv-top:      rgba(74, 222, 128, 0.09);
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
  --text-muted:    #5E6D87;
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
  --glass-inset:   inset 0 1px 0 rgba(255, 255, 255, 0.10), inset 0 -1px 0 rgba(255, 255, 255, 0.03);
  --glass-sheen:   linear-gradient(160deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 55%, rgba(255, 255, 255, 0.04) 100%);
}
        ` }} />
      </head>
      <body style={{ display: "flex", width: "100%", height: "100%", background: "var(--bg-primary)", margin: 0, overflow: "hidden" }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "2rem 2.5rem" }} className="main-content">
          {children}
        </main>
        <AccessibilityWidget />
      </body>
    </html>
  );
}
