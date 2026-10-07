import type { Detection } from "@/lib/live-detections";
import { vehicleName } from "@/lib/edge-replay";
import { detectionColor, incidentColors, type Incident } from "@/lib/incident-overlays";

type Area = { x: number; y: number; width: number; height: number };

export function drawDetection(context: CanvasRenderingContext2D, area: Area, object: Detection, incident?: Incident, selected = false) {
  const [left, top, right, bottom] = object.box;
  const x = area.x + left * area.width, y = area.y + top * area.height;
  const width = (right - left) * area.width, height = (bottom - top) * area.height;
  const color = detectionColor(object, incident), weight = incident ? 2.5 : 1.5;
  context.setLineDash([]);
  if (selected) {
    context.strokeStyle = "#00150d"; context.lineWidth = 4;
    context.strokeRect(x - 4, y - 4, width + 8, height + 8);
    context.strokeStyle = incidentColors.selected; context.lineWidth = 2;
    context.strokeRect(x - 4, y - 4, width + 8, height + 8);
  }
  context.strokeStyle = "#00150d"; context.lineWidth = weight + 2;
  context.strokeRect(x, y, width, height);
  context.strokeStyle = color; context.lineWidth = weight;
  context.strokeRect(x, y, width, height);
  const attrs = object.attributes, name = attrs ? vehicleName(attrs.type, attrs.color, object.class_id) : object.label;
  const text = `${name} #${object.id}${selected ? " · Inspeccionando" : ""}`;
  const detail = incident ? `${incident.review === "confirmed" ? "Confirmada" : "Pendiente"}: ${incident.kind === "uturn" ? "vuelta en U" : "cruce en rojo"}` : "";
  const labelHeight = detail ? 32 : 17, labelY = Math.max(area.y, y - labelHeight - (selected ? 7 : 1));
  const labelWidth = Math.min(area.width, Math.max(context.measureText(text).width, context.measureText(detail).width) + 8);
  const labelX = Math.max(area.x, Math.min(x, area.x + area.width - labelWidth));
  context.fillStyle = "#00150deb"; context.fillRect(labelX, labelY, labelWidth, labelHeight);
  context.fillStyle = selected ? incidentColors.selected : color;
  context.fillText(text, labelX + 4, labelY + 2, labelWidth - 8);
  if (detail) { context.fillStyle = color; context.fillText(detail, labelX + 4, labelY + 17, labelWidth - 8); }
}
