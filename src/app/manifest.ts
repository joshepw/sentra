import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Senttra",
    short_name: "Senttra",
    description:
      "Plataforma de resiliencia y monitoreo Smart City: IA, seguridad y medio ambiente.",
    start_url: "/",
    display: "standalone",
    background_color: "#081411",
    theme_color: "#081411",
    icons: [
      {
        src: "/favicon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32",
        type: "image/x-icon",
      },
    ],
  };
}
