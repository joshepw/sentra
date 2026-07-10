import {
  buildWeatherSnapshot,
  openMeteoUrl,
  type WeatherSnapshot,
} from "@/lib/weather";

export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const res = await fetch(openMeteoUrl(), {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return Response.json(
        { error: "No se pudo obtener el clima de San Pedro Sula" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const snapshot: WeatherSnapshot = buildWeatherSnapshot(data);

    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return Response.json(
      { error: "Error al consultar Open-Meteo" },
      { status: 500 },
    );
  }
}
