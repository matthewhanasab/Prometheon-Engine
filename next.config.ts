import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Baseline hardening. No strict CSP: the app embeds TradingView widgets and
    // uses inline theme-init scripts, which a locked-down script-src would break.
    // SAMEORIGIN (not DENY) because the landing page previews app pages in
    // same-origin iframes.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // Report-only for now: the policy covers what the site actually loads
          // (its own code, TradingView's embeds, Google Fonts), and a browser
          // that disagrees reports rather than breaks. Enforce once the
          // console stays quiet.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com",
              "frame-src 'self' https://*.tradingview.com https://www.tradingview-widget.com",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.tradingview.com https://*.tradingview-widget.com",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Local development without data keys: start the dev server with
    // DEV_API_ORIGIN set to the live site and every /api call is answered from
    // there, so pages render with real data. Never active in a production build.
    const origin = process.env.NODE_ENV !== "production" ? process.env.DEV_API_ORIGIN : undefined;
    if (!origin) return [];
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${origin}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    // The old dual-edition URLs — the mirror became the site.
    return [
      { source: "/marketstack", destination: "/research", permanent: true },
      { source: "/ms", destination: "/research", permanent: true },
      { source: "/ms/research", destination: "/research", permanent: true },
      { source: "/ms/:page*", destination: "/:page*", permanent: true },
      // The portfolio tracker was retired; the research page is the nearest home.
      { source: "/portfolio", destination: "/research", permanent: true },
    ];
  },
};

export default nextConfig;
