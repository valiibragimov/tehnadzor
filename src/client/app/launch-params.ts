import { APP_STORAGE_KEYS } from "./storage.js";

const VALID_TAB_TARGETS = new Set([
  "geo",
  "reinforcement",
  "geometry",
  "strength",
  "summary",
  "journal",
  "knowledge"
]);

const TAB_ALIASES: Record<string, string> = {
  plate: "geo",
  slab: "geo"
};

const CONSTRUCTION_ALIASES: Record<string, string> = {
  plate: "Плита",
  slab: "Плита",
  column: "Колонна",
  wall: "Стена",
  stair: "Лестница",
  stairs: "Лестница",
  beam: "Балка"
};

interface ApplyLaunchParamsOptions {
  setConstructionAndTrigger: (constructionType: string) => boolean;
  storage?: Storage;
  storageKey?: string;
}

function normalizeLaunchConstruction(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return CONSTRUCTION_ALIASES[normalized] || null;
}

function normalizeLaunchTab(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const resolved = TAB_ALIASES[normalized] || normalized;
  return VALID_TAB_TARGETS.has(resolved) ? resolved : null;
}

export function applyLaunchParamsFromUrl({
  setConstructionAndTrigger,
  storage = localStorage,
  storageKey = APP_STORAGE_KEYS.tab
}: ApplyLaunchParamsOptions) {
  const url = new URL(window.location.href);
  const rawTab = url.searchParams.get("tab");
  const rawConstruction = url.searchParams.get("construction");

  if (!rawTab && !rawConstruction) {
    return;
  }

  const launchTab = normalizeLaunchTab(rawTab);
  const launchConstruction =
    normalizeLaunchConstruction(rawConstruction) ||
    (String(rawTab || "").trim().toLowerCase() === "plate" ? "Плита" : null);

  if (launchTab) {
    storage.setItem(storageKey, launchTab);
  }

  if (launchConstruction) {
    setConstructionAndTrigger(launchConstruction);
  }

  url.searchParams.delete("tab");
  url.searchParams.delete("construction");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}
