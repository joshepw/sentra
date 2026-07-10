import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://senttra.com/sitemap.xml",
    host: "https://senttra.com",
  };
}
