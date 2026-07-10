import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#081411",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 999,
            border: "5px solid rgba(61,214,140,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: 999,
              border: "6px solid #3dd68c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: "#3dd68c",
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
