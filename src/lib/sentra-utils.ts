export function sevColor(sev: "alta" | "media" | "baja") {
  if (sev === "alta") return "#e0655a";
  if (sev === "media") return "#e6b24d";
  return "#3dd68c";
}

export function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function hhmmss(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function windCardinal(deg: number) {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function moonData() {
  const REF = 947182440000;
  const SYN = 29.530588853;
  const age = (((Date.now() - REF) / 86400000) % SYN + SYN) % SYN;
  const p = age / SYN;
  const illum = (1 - Math.cos(2 * Math.PI * p)) / 2;
  const waxing = p < 0.5;
  let name = "Luna nueva";
  if (p < 0.02 || p > 0.98) name = "Luna nueva";
  else if (p < 0.23) name = "Creciente iluminante";
  else if (p < 0.27) name = "Cuarto creciente";
  else if (p < 0.48) name = "Gibosa creciente";
  else if (p < 0.52) name = "Luna llena";
  else if (p < 0.73) name = "Gibosa menguante";
  else if (p < 0.77) name = "Cuarto menguante";
  else name = "Creciente menguante";

  const cx = 24;
  const cy = 24;
  const r = 20;
  const k = Math.abs(1 - 2 * illum) * r;
  const inner = illum < 0.5 ? 0 : 1;
  const d = `M${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx} ${cy + r} A${k.toFixed(2)} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`;
  const transform = waxing ? "" : `translate(${2 * cx} 0) scale(-1 1)`;

  return { name, illum: Math.round(illum * 100), d, transform };
}

export function envForecast(storm: number, rain: number) {
  if (storm >= 16) return "Riesgo de tormenta eléctrica en aumento";
  if (rain >= 28) return "Probabilidad de lluvia en las próximas horas";
  return "Estable · sin lluvia significativa";
}
