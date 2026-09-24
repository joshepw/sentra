import type { NextConfig } from "next";

// Keep the original Next.js dashboard. Only its protected data, video and
// authentication requests go to the edge computer, on the same browser origin.
const edgeOrigin = (
  process.env.SENTTRA_EDGE_ORIGIN ?? "https://senttra.filosofiacodigo.com"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        ...["api", "auth", "media"].map((part) => ({
          source: `/edge/${part}/:path*`,
          destination: `${edgeOrigin}/edge/${part}/:path*`,
        })),
        { source: "/edge/healthz", destination: `${edgeOrigin}/edge/healthz` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/edge/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
