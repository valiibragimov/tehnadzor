export const APP_STORAGE_KEYS = {
  nodes: "geo_nodes_v1",
  meta: "app_meta_v1",
  tab: "active_tab_v1",
  journal: "journal_v1",
  reinf: "reinf_checks_v1",
  geom: "geom_checks_v1",
  streng: "strength_checks_v1"
} as const;

export function moduleStorageKey(base: string, currentProjectId: string | null) {
  const id = currentProjectId || "no_project";
  return `${base}_${id}`;
}

export function fmtDate(ts: string | number | Date) {
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatNodeValue(value: string | number | null | undefined, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(numeric)) return "—";
  const rounded = Math.round(numeric * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + (unit ? ` ${unit}` : "");
}
