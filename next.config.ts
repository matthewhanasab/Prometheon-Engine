import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    turbopackRoot: path.resolve(__dirname),
  },
};

export default nextConfig;
