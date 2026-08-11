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
        ],
      },
    ];
  },
  async redirects() {
    // The old dual-edition URLs — the mirror became the site.
    return [
      { source: "/marketstack", destination: "/research", permanent: true },
      { source: "/ms", destination: "/research", permanent: true },
      { source: "/ms/research", destination: "/research", permanent: true },
      { source: "/ms/:page*", destination: "/:page*", permanent: true },
    ];
  },
};

export default nextConfig;
