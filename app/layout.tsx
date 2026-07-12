import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

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
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  box-shadow: var(--card-shadow);
}
tr[style*="border:1px solid var(--border)"],
td[style*="border:1px solid var(--border)"],
th[style*="border:1px solid var(--border)"] {
  backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none;
}

.logo-on-dark { display: none; }
:root[data-theme="dark"] .logo-on-dark { display: inline-block; }
:root[data-theme="dark"] .logo-on-light { display: none; }

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
  --card-shadow:   0 12px 32px rgba(0, 0, 0, 0.35);
}
        ` }} />
      </head>
      <body style={{ display: "flex", width: "100%", height: "100%", background: "var(--bg-primary)", margin: 0, overflow: "hidden" }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "2rem 2.5rem" }} className="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
