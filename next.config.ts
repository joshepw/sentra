import type { NextConfig } from "next";

// The edge computer owns authentication, video ranges and inference. Keep the
// whole mount on one browser origin so HttpOnly cookies protect every request.
const edgeOrigin = (
  process.env.SENTTRA_EDGE_ORIGIN ?? "https://senttra.filosofiacodigo.com"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/edge/:path*", destination: `${edgeOrigin}/edge/:path*` },
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
