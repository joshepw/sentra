export const PRIMARY_SECTOR = "primera_calle";
export const SECTORS = [
  { id: PRIMARY_SECTOR, title: "1era Calle" },
  { id: "armenta", title: "Armenta" },
  { id: "satelite", title: "La Satélite" },
  { id: "andes", title: "Los Andes" },
  { id: "guamilito", title: "Guamilito" },
  { id: "trejo", title: "La Trejo" },
] as const;

export type SectorId = typeof SECTORS[number]["id"];

export function sectorAfterChange(current: SectorId | null, changes: {
  sector?: SectorId | null; camera?: string; all?: boolean; mode?: "live" | "history";
}): SectorId | null {
  if (changes.sector !== undefined) return changes.sector;
  if (changes.camera) return PRIMARY_SECTOR;
  if (current === null && (changes.mode || changes.all !== undefined)) return PRIMARY_SECTOR;
  return current;
}
