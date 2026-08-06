import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
