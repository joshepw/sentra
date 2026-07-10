import { ImageResponse } from "next/og";

export const alt = "Senttra — Smart City · Resiliencia y Monitoreo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #0b1d16 0%, #081411 55%, #0a1a14 100%)",
          padding: "72px 80px",
          color: "#e9f0ea",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              border: "3px solid rgba(61,214,140,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: "3.5px solid #3dd68c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: "#3dd68c",
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Senttra
            <span style={{ color: "#3dd68c", fontSize: 48, lineHeight: 1 }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            }}
          >
            La ciudad que se anticipa.
          </div>
          <div style={{ fontSize: 28, color: "#90a89a", lineHeight: 1.4, maxWidth: 780 }}>
            Inteligencia artificial, seguridad y monitoreo ambiental en una sola
            capa de decisión.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#5f7468",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>Smart City · Resiliencia</span>
          <span style={{ color: "#3dd68c" }}>senttra.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
