import type { Metadata } from "next";

// Demo de detección de robos por análisis de comportamiento (pose/esqueletos). El backend
// (FastAPI con video streaming + poses + scores STG-NF) vive en el server propio detrás de
// Caddy; acá se embebe a pantalla completa. Configurable por NEXT_PUBLIC_ESQUELETO_URL.
const SRC = process.env.NEXT_PUBLIC_ESQUELETO_URL ?? "https://esqueleto.filosofiacodigo.com";

export const metadata: Metadata = {
  title: "Sentra Retail · Detección de robos por comportamiento",
  description: "Análisis de pose corporal (hombros, brazos, piernas) + IA de anomalía para detectar hurtos en tienda.",
};

export default function DemoEsqueletoPage() {
  return (
    <iframe
      src={SRC}
      title="Sentra Retail — detección de robos por comportamiento"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: "none" }}
      allow="autoplay; fullscreen"
    />
  );
}
