/** San Pedro Sula — Open-Meteo forecast coordinates */
export const SPS_COORDS = {
  latitude: 15.5059,
  longitude: -88.0259,
  timezone: "America/Tegucigalpa",
  label: "San Pedro Sula, HN",
} as const;

export type WeatherSnapshot = {
  location: string;
  updatedAt: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  dewPoint: number;
  pressure: number;
  vaporPressure: number;
  windSpeed: number;
  windGust: number;
  windDir: number;
  windMaxToday: number;
  solar: number;
  precipToday: number;
  cloudCover: number;
  rainProb: number;
  stormRisk: number;
  heatStress: number;
  confidence: number;
  condition: string;
  conditionCode: number;
  forecast: string;
  source: string;
};

const WMO_LABELS: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna",
  55: "Llovizna intensa",
  56: "Llovizna helada",
  57: "Llovizna helada intensa",
  61: "Lluvia ligera",
  63: "Lluvia",
  65: "Lluvia intensa",
  66: "Lluvia helada",
  67: "Lluvia helada intensa",
  71: "Nieve ligera",
  73: "Nieve",
  75: "Nieve intensa",
  77: "Granizo fino",
  80: "Chubascos ligeros",
  81: "Chubascos",
  82: "Chubascos intensos",
  85: "Chubascos de nieve",
  86: "Chubascos de nieve intensos",
  95: "Tormenta eléctrica",
  96: "Tormenta con granizo",
  99: "Tormenta con granizo intenso",
};

export function weatherLabel(code: number) {
  return WMO_LABELS[code] ?? "Condiciones variables";
}

function heatStressPct(feelsLike: number, humidity: number) {
  // Rough heat-stress index for tropical cities (0–100)
  const base = ((feelsLike - 24) / 16) * 70;
  const humid = ((humidity - 40) / 60) * 30;
  return Math.round(Math.max(0, Math.min(100, base + humid)));
}

function stormRiskFromCodes(codes: number[], rainProb: number) {
  const stormy = codes.some((c) => c >= 95);
  const heavy = codes.some((c) => c === 65 || c === 82 || c === 67);
  let risk = Math.round(rainProb * 0.45);
  if (heavy) risk += 18;
  if (stormy) risk += 35;
  return Math.max(0, Math.min(100, risk));
}

function forecastText(storm: number, rain: number, codes: number[]) {
  if (codes.some((c) => c >= 95)) return "Riesgo de tormenta eléctrica en aumento";
  if (storm >= 40) return "Riesgo de tormenta eléctrica en aumento";
  if (rain >= 55) return "Probabilidad de lluvia en las próximas horas";
  if (rain >= 35) return "Posibles lluvias dispersas en la tarde";
  return "Estable · sin lluvia significativa";
}

type OpenMeteoResponse = {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    shortwave_radiation: number;
    dew_point_2m: number;
    vapour_pressure_deficit: number;
  };
  hourly: {
    time: string[];
    precipitation_probability: (number | null)[];
    weather_code: (number | null)[];
  };
  daily: {
    precipitation_sum: (number | null)[];
    wind_gusts_10m_max: (number | null)[];
  };
};

export function buildWeatherSnapshot(data: OpenMeteoResponse): WeatherSnapshot {
  const { current, hourly, daily } = data;
  const nowIdx = Math.max(
    0,
    hourly.time.findIndex((t) => t >= current.time.slice(0, 13)),
  );
  const next6 = Array.from({ length: 6 }, (_, i) => nowIdx + i).filter(
    (i) => i < hourly.time.length,
  );
  const rainProb = Math.round(
    Math.max(
      0,
      ...next6.map((i) => hourly.precipitation_probability[i] ?? 0),
    ),
  );
  const nextCodes = next6.map((i) => hourly.weather_code[i] ?? 0);
  const stormRisk = stormRiskFromCodes(nextCodes, rainProb);
  const heatStress = heatStressPct(
    current.apparent_temperature,
    current.relative_humidity_2m,
  );

  return {
    location: SPS_COORDS.label,
    updatedAt: current.time,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    dewPoint: current.dew_point_2m,
    pressure: current.pressure_msl,
    vaporPressure: current.vapour_pressure_deficit,
    windSpeed: current.wind_speed_10m,
    windGust: current.wind_gusts_10m,
    windDir: current.wind_direction_10m,
    windMaxToday: daily.wind_gusts_10m_max[0] ?? current.wind_gusts_10m,
    solar: Math.round(current.shortwave_radiation),
    precipToday: daily.precipitation_sum[0] ?? current.precipitation,
    cloudCover: current.cloud_cover,
    rainProb,
    stormRisk,
    heatStress,
    confidence: 90,
    condition: weatherLabel(current.weather_code),
    conditionCode: current.weather_code,
    forecast: forecastText(stormRisk, rainProb, nextCodes),
    source: "Open-Meteo",
  };
}

export function openMeteoUrl() {
  const params = new URLSearchParams({
    latitude: String(SPS_COORDS.latitude),
    longitude: String(SPS_COORDS.longitude),
    timezone: SPS_COORDS.timezone,
    wind_speed_unit: "kmh",
    forecast_days: "2",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "shortwave_radiation",
      "dew_point_2m",
      "vapour_pressure_deficit",
    ].join(","),
    hourly: [
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "temperature_2m",
      "wind_gusts_10m",
    ].join(","),
    daily: ["precipitation_sum", "temperature_2m_max", "wind_gusts_10m_max"].join(
      ",",
    ),
  });

  return `https://api.open-meteo.com/v1/forecast?${params}`;
}
