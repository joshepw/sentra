"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es-HN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#081411",
          color: "#e9f0ea",
          fontFamily:
            '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
          padding: "2rem 1.25rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <p
            style={{
              margin: "0 0 1rem",
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#e0655a",
            }}
          >
            Error 500
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Senttra no pudo cargar.
          </h1>
          <p
            style={{
              margin: "1.25rem 0 0",
              color: "#90a89a",
              fontSize: 17,
              lineHeight: 1.55,
            }}
          >
            Ocurrió un error inesperado. Reintenta o vuelve en unos momentos.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 40,
              cursor: "pointer",
              border: "none",
              borderRadius: 11,
              background: "#3dd68c",
              color: "#081411",
              fontWeight: 600,
              fontSize: 14,
              padding: "14px 28px",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
