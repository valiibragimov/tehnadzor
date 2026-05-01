import {
  getInspectionConfig,
  getInspectionInfoMessage,
  getInspectionModuleStatus
} from "./inspection-registry.js";

export const LEGACY_GENERIC_CONSTRUCTION = "Элемент";

export type ConstructionBehaviorProfile =
  | "plate"
  | "column"
  | "wall"
  | "beam"
  | "stair"
  | "formwork"
  | "unsupported";

export type ConstructionBehaviorModule =
  | "geo"
  | "geometry"
  | "reinforcement"
  | "strength"
  | "bim"
  | "autofill"
  | "journal"
  | "display";

export type ConstructionLocationMode =
  | "none"
  | "single_axis"
  | "plate_range"
  | "strip_foundation"
  | "wall_binding";

export type ConstructionElementSheetMode =
  | "none"
  | "columns"
  | "walls"
  | "beams"
  | "stairs"
  | "formwork";

export interface ConstructionSubtypeOption {
  key: string;
  label: string;
}

export interface ConstructionModuleBehavior {
  profile: ConstructionBehaviorProfile;
  supported?: boolean;
  message?: string;
  floorVisible?: boolean;
  floorRequired?: boolean;
  locationMode?: ConstructionLocationMode;
  elementSheetMode?: ConstructionElementSheetMode;
  showOpeningPoints?: boolean;
  showStairName?: boolean;
  maxWalls?: number | null;
  showGeoFlatnessCheck?: boolean;
  showOpeningSizes?: boolean;
  showPlateFlatness?: boolean;
  showCommonWidth?: boolean;
  showCommonVerticalDeviation?: boolean;
  showCommonPlaneDeviation?: boolean;
  showNote?: boolean;
  showReinforcementCommonFields?: boolean;
  showReinforcementHoopsStep?: boolean;
  geometryProjectHeightLabel?: string;
  geometryFactHeightLabel?: string;
  geometryProjectOpeningLabel?: string;
  geometryFactOpeningLabel?: string;
  geometryFlatnessLabel?: string;
  geometryCommonProjectWidthLabel?: string;
  geometryCommonFactWidthLabel?: string;
  geometryCommonVerticalDeviationLabel?: string;
  geometryCommonPlaneDeviationLabel?: string;
  journalDisplayLabel?: string;
}

interface ConstructionCategoryOption {
  key: string;
  label: string;
  visible?: boolean;
}

interface ConstructionOption {
  key: string;
  label: string;
  categoryKey: string;
  legacyType: string;
  visible?: boolean;
  subtypeLabel?: string;
  defaultSubtype?: string;
  subtypeOptions?: readonly ConstructionSubtypeOption[];
  aliases?: readonly string[];
  modules: Readonly<Record<ConstructionBehaviorModule, ConstructionModuleBehavior>>;
  subtypeBehaviors?: Readonly<Record<string, Partial<Record<ConstructionBehaviorModule, Partial<ConstructionModuleBehavior>>>>>;
}

const MODULE_FALLBACK_MESSAGES: Readonly<Record<ConstructionBehaviorModule, string>> = Object.freeze({
  geo: "Для этой конструкции геодезическая привязка ещё не реализована. Используйте ручную проверку после доработки модуля.",
  geometry: "Для этой конструкции модуль геометрии ещё находится в разработке.",
  reinforcement: "Для этой конструкции модуль армирования ещё находится в разработке.",
  strength: "Для этой конструкции модуль прочности ещё находится в разработке.",
  bim: "Для этой конструкции BIM-привязка пока поддерживается только в ручном режиме.",
  autofill: "Для этой конструкции BIM-автозаполнение пока недоступно.",
  journal: "Для этой конструкции доступны только базовые записи журнала.",
  display: "Для этой конструкции используется временный режим отображения."
});

export const CONSTRUCTION_BEHAVIOR_PROFILES = Object.freeze([
  "plate",
  "column",
  "wall",
  "beam",
  "stair",
  "formwork",
  "unsupported"
] as const satisfies readonly ConstructionBehaviorProfile[]);

export const CONSTRUCTION_BEHAVIOR_MODULES = Object.freeze([
  "geo",
  "geometry",
  "reinforcement",
  "strength",
  "bim",
  "autofill",
  "journal",
  "display"
] as const satisfies readonly ConstructionBehaviorModule[]);

const PROFILE_TO_LEGACY_TYPE: Readonly<Record<ConstructionBehaviorProfile, string>> = Object.freeze({
  plate: "Плита",
  column: "Колонна",
  wall: "Стена",
  beam: "Балка",
  stair: "Лестница",
  formwork: LEGACY_GENERIC_CONSTRUCTION,
  unsupported: LEGACY_GENERIC_CONSTRUCTION
});

const ALL_CONSTRUCTION_CATEGORIES: readonly ConstructionCategoryOption[] = Object.freeze([
  { key: "foundation", label: "Фундамент", visible: true },
  { key: "vertical_load_bearing", label: "Вертикальные несущие элементы", visible: true },
  { key: "horizontal_load_bearing", label: "Горизонтальные несущие элементы", visible: true },
  { key: "stiffness_cores", label: "Ядра жесткости", visible: true },
  { key: "formwork", label: "Опалубка", visible: true },
  { key: "rebar", label: "Арматурный каркас", visible: false }
] as const);

const plateBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "plate",
  supported: true,
  floorVisible: true,
  floorRequired: true,
  locationMode: "plate_range",
  elementSheetMode: "none",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: true,
  showPlateFlatness: true,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: true,
  showReinforcementHoopsStep: false,
  geometryProjectHeightLabel: "Проектная толщина плиты",
  geometryFactHeightLabel: "Фактическая толщина плиты",
  geometryProjectOpeningLabel: "Проектные размеры проёмов",
  geometryFactOpeningLabel: "Фактические размеры проёмов",
  geometryFlatnessLabel: "Фактическая плоскостность плиты",
  geometryCommonProjectWidthLabel: "Проектная ширина",
  geometryCommonFactWidthLabel: "Фактическая ширина",
  geometryCommonVerticalDeviationLabel: "Отклонение по вертикали",
  geometryCommonPlaneDeviationLabel: "Отклонение по плоскости",
  ...overrides
});

const wallBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "wall",
  supported: true,
  floorVisible: true,
  floorRequired: true,
  locationMode: "wall_binding",
  elementSheetMode: "walls",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: true,
  showPlateFlatness: false,
  showCommonWidth: true,
  showCommonVerticalDeviation: true,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: false,
  showReinforcementHoopsStep: false,
  geometryProjectHeightLabel: "Проектная толщина элемента",
  geometryFactHeightLabel: "Фактическая толщина элемента",
  geometryProjectOpeningLabel: "Проектные размеры проёмов",
  geometryFactOpeningLabel: "Фактические размеры проёмов",
  geometryFlatnessLabel: "Фактическая плоскостность стены",
  geometryCommonProjectWidthLabel: "Проектная толщина элемента",
  geometryCommonFactWidthLabel: "Фактическая толщина элемента",
  geometryCommonVerticalDeviationLabel: "Отклонение по вертикали",
  geometryCommonPlaneDeviationLabel: "Отклонение по плоскости",
  ...overrides
});

const columnBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "column",
  supported: true,
  floorVisible: true,
  floorRequired: true,
  locationMode: "single_axis",
  elementSheetMode: "columns",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: false,
  showReinforcementHoopsStep: false,
  ...overrides
});

const beamBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "beam",
  supported: true,
  floorVisible: true,
  floorRequired: true,
  locationMode: "single_axis",
  elementSheetMode: "beams",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: false,
  showReinforcementHoopsStep: false,
  ...overrides
});

const stairBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "stair",
  supported: true,
  floorVisible: true,
  floorRequired: true,
  locationMode: "plate_range",
  elementSheetMode: "stairs",
  showOpeningPoints: true,
  showStairName: true,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: true,
  showReinforcementHoopsStep: false,
  ...overrides
});

const formworkBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "formwork",
  supported: true,
  floorVisible: false,
  floorRequired: false,
  locationMode: "none",
  elementSheetMode: "formwork",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: false,
  showReinforcementHoopsStep: false,
  geometryProjectHeightLabel: "Проектная высота",
  geometryFactHeightLabel: "Фактическая высота",
  geometryProjectOpeningLabel: "Проектная ширина",
  geometryFactOpeningLabel: "Фактическая ширина",
  geometryFlatnessLabel: "Отклонение по плоскости",
  geometryCommonProjectWidthLabel: "Проектная ширина",
  geometryCommonFactWidthLabel: "Фактическая ширина",
  geometryCommonVerticalDeviationLabel: "Отклонение от вертикали",
  geometryCommonPlaneDeviationLabel: "Отклонение по плоскости",
  ...overrides
});

const unsupportedBehavior = (
  overrides: Partial<ConstructionModuleBehavior> = {}
): ConstructionModuleBehavior => ({
  profile: "unsupported",
  supported: false,
  floorVisible: false,
  floorRequired: false,
  locationMode: "none",
  elementSheetMode: "none",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null,
  showGeoFlatnessCheck: false,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false,
  showReinforcementCommonFields: false,
  showReinforcementHoopsStep: false,
  ...overrides
});

const ALL_CONSTRUCTION_OPTIONS: readonly ConstructionOption[] = Object.freeze([
  {
    key: "foundation_slab",
    label: "Монолитная железобетонная плита",
    categoryKey: "foundation",
    legacyType: "Плита",
    visible: true,
    aliases: ["монолитная железобетонная плита"],
    modules: {
      geo: plateBehavior({
        floorVisible: false,
        floorRequired: false,
        showOpeningPoints: false
      }),
      geometry: plateBehavior({
        floorVisible: false,
        floorRequired: false,
        showOpeningSizes: false
      }),
      reinforcement: plateBehavior({ floorVisible: false, floorRequired: false }),
      strength: plateBehavior({ floorVisible: false, floorRequired: false }),
      bim: plateBehavior({ floorVisible: false, floorRequired: false }),
      autofill: plateBehavior({ floorVisible: false, floorRequired: false }),
      journal: plateBehavior({ floorVisible: false, floorRequired: false }),
      display: plateBehavior({ floorVisible: false, floorRequired: false })
    }
  },
  {
    key: "strip_foundation",
    label: "Ленточный фундамент",
    categoryKey: "foundation",
    legacyType: "Плита",
    visible: true,
    aliases: ["ленточный фундамент"],
    modules: {
      geo: plateBehavior({
        floorVisible: false,
        floorRequired: false,
        locationMode: "strip_foundation",
        showOpeningPoints: false
      }),
      geometry: plateBehavior({
        floorVisible: false,
        floorRequired: false,
        locationMode: "strip_foundation",
        showOpeningSizes: true,
        showPlateFlatness: false,
        geometryProjectHeightLabel: "Высота ленточного фундамента (проектная)",
        geometryFactHeightLabel: "Высота ленточного фундамента (фактическая)",
        geometryProjectOpeningLabel: "Проектная ширина фундамента",
        geometryFactOpeningLabel: "Фактическая ширина фундамента"
      }),
      reinforcement: plateBehavior({
        floorVisible: false,
        floorRequired: false,
        locationMode: "strip_foundation",
        showReinforcementHoopsStep: true
      }),
      strength: plateBehavior({ floorVisible: false, floorRequired: false }),
      bim: plateBehavior({ floorVisible: false, floorRequired: false }),
      autofill: plateBehavior({ floorVisible: false, floorRequired: false }),
      journal: plateBehavior({ floorVisible: false, floorRequired: false }),
      display: plateBehavior({ floorVisible: false, floorRequired: false })
    }
  },
  {
    key: "pile_grillage",
    label: "Свайно-ростверковый фундамент",
    categoryKey: "foundation",
    legacyType: "Плита",
    visible: true,
    aliases: ["свайно-ростверковый фундамент", "свайное поле с ростверком"],
    subtypeLabel: "Тип сваи",
    defaultSubtype: "bored_piles",
    subtypeOptions: Object.freeze([
      { key: "precast_rc_piles", label: "Забивные ЖБ-сваи" },
      { key: "screw_piles", label: "Винтовые сваи" },
      { key: "bored_piles", label: "Буронабивные сваи" }
    ]),
    modules: {
      geo: plateBehavior({ floorVisible: false, floorRequired: false, showOpeningPoints: false }),
      geometry: plateBehavior({
        floorVisible: false,
        floorRequired: false,
        locationMode: "none",
        showOpeningSizes: true,
        showPlateFlatness: false,
        geometryProjectHeightLabel: "Проектная высота сваи",
        geometryFactHeightLabel: "Фактическая высота сваи",
        geometryProjectOpeningLabel: "Проектный диаметр сваи",
        geometryFactOpeningLabel: "Фактический диаметр сваи"
      }),
      reinforcement: plateBehavior({ floorVisible: false, floorRequired: false }),
      strength: plateBehavior({ floorVisible: false, floorRequired: false }),
      bim: plateBehavior({ floorVisible: false, floorRequired: false }),
      autofill: plateBehavior({ floorVisible: false, floorRequired: false }),
      journal: plateBehavior({ floorVisible: false, floorRequired: false }),
      display: plateBehavior({ floorVisible: false, floorRequired: false })
    }
  },
  {
    key: "wall",
    label: "Стена",
    categoryKey: "vertical_load_bearing",
    legacyType: "Стена",
    visible: true,
    aliases: ["стена"],
    modules: {
      geo: wallBehavior(),
      geometry: wallBehavior(),
      reinforcement: wallBehavior(),
      strength: wallBehavior(),
      bim: wallBehavior(),
      autofill: wallBehavior(),
      journal: wallBehavior(),
      display: wallBehavior()
    }
  },
  {
    key: "column",
    label: "Колонна",
    categoryKey: "vertical_load_bearing",
    legacyType: "Колонна",
    visible: true,
    aliases: ["колонна"],
    modules: {
      geo: columnBehavior(),
      geometry: columnBehavior(),
      reinforcement: columnBehavior(),
      strength: columnBehavior(),
      bim: columnBehavior(),
      autofill: columnBehavior(),
      journal: columnBehavior(),
      display: columnBehavior()
    }
  },
  {
    key: "pylon",
    label: "Пилон",
    categoryKey: "vertical_load_bearing",
    legacyType: "Стена",
    visible: true,
    aliases: ["пилон"],
    modules: {
      geo: wallBehavior(),
      geometry: wallBehavior(),
      reinforcement: wallBehavior(),
      strength: wallBehavior(),
      bim: wallBehavior(),
      autofill: wallBehavior(),
      journal: wallBehavior(),
      display: wallBehavior()
    }
  },
  {
    key: "floor_slab",
    label: "Перекрытие",
    categoryKey: "horizontal_load_bearing",
    legacyType: "Плита",
    visible: true,
    aliases: ["перекрытие", "плита перекрытия", "плита"],
    modules: {
      geo: plateBehavior({ showGeoFlatnessCheck: true }),
      geometry: plateBehavior(),
      reinforcement: plateBehavior(),
      strength: plateBehavior(),
      bim: plateBehavior(),
      autofill: plateBehavior(),
      journal: plateBehavior(),
      display: plateBehavior()
    }
  },
  {
    key: "beam",
    label: "Балка",
    categoryKey: "horizontal_load_bearing",
    legacyType: "Балка",
    visible: true,
    aliases: ["балка"],
    modules: {
      geo: beamBehavior({ locationMode: "strip_foundation" }),
      geometry: beamBehavior(),
      reinforcement: beamBehavior(),
      strength: beamBehavior(),
      bim: beamBehavior(),
      autofill: beamBehavior(),
      journal: beamBehavior(),
      display: beamBehavior()
    }
  },
  {
    key: "elevator_shaft",
    label: "Шахта лифта",
    categoryKey: "stiffness_cores",
    legacyType: "Стена",
    visible: true,
    aliases: ["шахта лифта"],
    modules: {
      geo: wallBehavior({
        locationMode: "plate_range",
        showOpeningPoints: true,
        maxWalls: 4
      }),
      geometry: wallBehavior({
        locationMode: "plate_range",
        showOpeningPoints: true,
        maxWalls: 4
      }),
      reinforcement: wallBehavior({
        locationMode: "plate_range",
        showOpeningPoints: true,
        maxWalls: 4
      }),
      strength: wallBehavior({
        locationMode: "plate_range",
        showOpeningPoints: true,
        maxWalls: 4
      }),
      bim: wallBehavior(),
      autofill: wallBehavior(),
      journal: wallBehavior({ maxWalls: 4 }),
      display: wallBehavior()
    }
  },
  {
    key: "stair_core",
    label: "Лестничная клетка",
    categoryKey: "stiffness_cores",
    legacyType: "Лестница",
    visible: true,
    aliases: ["лестничная клетка", "лестница"],
    modules: {
      geo: stairBehavior({ showOpeningPoints: false }),
      geometry: stairBehavior({ showOpeningPoints: false }),
      reinforcement: stairBehavior({ showOpeningPoints: false }),
      strength: stairBehavior({ showOpeningPoints: false }),
      bim: stairBehavior(),
      autofill: stairBehavior(),
      journal: stairBehavior(),
      display: stairBehavior()
    }
  },
  {
    key: "formwork",
    label: "Опалубка",
    categoryKey: "formwork",
    legacyType: LEGACY_GENERIC_CONSTRUCTION,
    visible: true,
    aliases: ["опалубка", "временная опалубка", "несъемная опалубка", "несъёмная опалубка"],
    subtypeLabel: "Тип опалубки",
    defaultSubtype: "temporary",
    subtypeOptions: Object.freeze([
      { key: "temporary", label: "Временная" },
      { key: "permanent", label: "Несъёмная" }
    ]),
    modules: {
      geo: unsupportedBehavior(),
      geometry: formworkBehavior(),
      reinforcement: unsupportedBehavior(),
      strength: unsupportedBehavior(),
      bim: unsupportedBehavior(),
      autofill: unsupportedBehavior(),
      journal: formworkBehavior({ supported: true, profile: "formwork" }),
      display: formworkBehavior({ supported: true, profile: "formwork" })
    }
  },
  {
    key: "rebar_cage",
    label: "Арматурный каркас",
    categoryKey: "rebar",
    legacyType: LEGACY_GENERIC_CONSTRUCTION,
    visible: false,
    aliases: ["арматурный каркас"],
    modules: {
      geo: unsupportedBehavior(),
      geometry: unsupportedBehavior(),
      reinforcement: unsupportedBehavior(),
      strength: unsupportedBehavior(),
      bim: unsupportedBehavior(),
      autofill: unsupportedBehavior(),
      journal: unsupportedBehavior(),
      display: unsupportedBehavior()
    }
  }
] as const);

export const CONSTRUCTION_CATEGORIES = Object.freeze(
  ALL_CONSTRUCTION_CATEGORIES.filter((category) => category.visible !== false).map((category) => ({
    key: category.key,
    label: category.label
  }))
);

export const CONSTRUCTION_OPTIONS = Object.freeze(
  ALL_CONSTRUCTION_OPTIONS.filter((option) => option.visible !== false).map((option) => ({
    key: option.key,
    label: option.label,
    categoryKey: option.categoryKey,
    legacyType: option.legacyType,
    profiles: buildProfiles(option.modules)
  }))
);

function buildProfiles(
  modules: Readonly<Record<ConstructionBehaviorModule, ConstructionModuleBehavior>>
): Readonly<Record<ConstructionBehaviorModule, ConstructionBehaviorProfile>> {
  return Object.freeze(
    CONSTRUCTION_BEHAVIOR_MODULES.reduce((acc, module) => {
      acc[module] = modules[module]?.profile || "unsupported";
      return acc;
    }, {} as Record<ConstructionBehaviorModule, ConstructionBehaviorProfile>)
  );
}

const constructionOptionMap = new Map(ALL_CONSTRUCTION_OPTIONS.map((option) => [option.key, option]));
const constructionCategoryMap = new Map(ALL_CONSTRUCTION_CATEGORIES.map((category) => [category.key, category]));

function normalizeAlias(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/\s+/g, " ");
}

const CONSTRUCTION_ALIASES = new Map<string, string>([
  ["foundation_slab", "foundation_slab"],
  ["strip_foundation", "strip_foundation"],
  ["pile_grillage", "pile_grillage"],
  ["wall", "wall"],
  ["column", "column"],
  ["pylon", "pylon"],
  ["floor_slab", "floor_slab"],
  ["beam", "beam"],
  ["elevator_shaft", "elevator_shaft"],
  ["stair_core", "stair_core"],
  ["formwork", "formwork"],
  ["rebar_cage", "rebar_cage"],
  ["plate", "floor_slab"],
  ["slab", "floor_slab"],
  ["stair", "stair_core"],
  ["staircase", "stair_core"],
  ["elevator shaft", "elevator_shaft"],
  ["temporary_formwork", "formwork"],
  ["permanent_formwork", "formwork"]
]);

ALL_CONSTRUCTION_OPTIONS.forEach((option) => {
  CONSTRUCTION_ALIASES.set(normalizeAlias(option.key), option.key);
  CONSTRUCTION_ALIASES.set(normalizeAlias(option.label), option.key);
  option.aliases?.forEach((alias) => {
    CONSTRUCTION_ALIASES.set(normalizeAlias(alias), option.key);
  });
});

const PILE_SUBTYPE_ALIASES = new Map<string, string>([
  ["precast_rc_piles", "precast_rc_piles"],
  ["забивные жб-сваи", "precast_rc_piles"],
  ["забивные железобетонные сваи", "precast_rc_piles"],
  ["винтовые", "screw_piles"],
  ["винтовые сваи", "screw_piles"],
  ["screw_piles", "screw_piles"],
  ["буронабивные", "bored_piles"],
  ["буронабивные сваи", "bored_piles"],
  ["bored_piles", "bored_piles"]
]);

const FORMWORK_SUBTYPE_ALIASES = new Map<string, string>([
  ["temporary", "temporary"],
  ["временная", "temporary"],
  ["temporary_formwork", "temporary"],
  ["permanent", "permanent"],
  ["постоянная", "permanent"],
  ["несъёмная", "permanent"],
  ["несъемная", "permanent"],
  ["permanent_formwork", "permanent"]
]);

function getConstructionProfilesOrNull(value: unknown) {
  const option = getConstructionOption(value);
  return option ? buildProfiles(option.modules) : null;
}

function getProfileFromLegacyValue(value: unknown): ConstructionBehaviorProfile | null {
  const normalized = normalizeAlias(value);
  if (!normalized) return null;
  if (normalized === normalizeAlias("Плита")) return "plate";
  if (normalized === normalizeAlias("Колонна")) return "column";
  if (normalized === normalizeAlias("Стена")) return "wall";
  if (normalized === normalizeAlias("Балка")) return "beam";
  if (normalized === normalizeAlias("Лестница")) return "stair";
  if (normalized === normalizeAlias(LEGACY_GENERIC_CONSTRUCTION)) return "unsupported";
  return null;
}

function mergeModuleBehavior(
  baseBehavior: ConstructionModuleBehavior,
  overrideBehavior?: Partial<ConstructionModuleBehavior>
): ConstructionModuleBehavior {
  if (!overrideBehavior) {
    return { ...baseBehavior };
  }

  return {
    ...baseBehavior,
    ...overrideBehavior
  };
}

function applyInspectionRegistryStatus(
  constructionKey: string,
  module: ConstructionBehaviorModule,
  subtypeKey: string,
  behavior: ConstructionModuleBehavior
): ConstructionModuleBehavior {
  if (!["geo", "geometry", "reinforcement", "strength"].includes(module)) {
    return behavior;
  }

  const inspectionModule = module as "geo" | "geometry" | "reinforcement" | "strength";
  const registryModuleConfig = getInspectionConfig(constructionKey, inspectionModule, subtypeKey);
  const registryFieldBehavior = registryModuleConfig && "fieldBehavior" in registryModuleConfig
    ? registryModuleConfig.fieldBehavior
    : null;
  const behaviorWithRegistryFields = registryFieldBehavior
    ? { ...behavior, ...registryFieldBehavior }
    : behavior;
  const registryStatus = getInspectionModuleStatus(constructionKey, inspectionModule, subtypeKey);
  if (!registryStatus) {
    return behaviorWithRegistryFields;
  }

  const registryMessage = getInspectionInfoMessage(
    constructionKey,
    inspectionModule,
    subtypeKey
  );

  if (registryStatus === "object") {
    return {
      ...behaviorWithRegistryFields,
      supported: behaviorWithRegistryFields.supported !== false,
      message: behaviorWithRegistryFields.message || registryMessage
    };
  }

  return {
    ...behaviorWithRegistryFields,
    supported: false,
    profile: "unsupported",
    message: registryMessage || behaviorWithRegistryFields.message
  };
}

function resolveConstructionOption(value: unknown) {
  const key = normalizeConstructionKey(value);
  return key ? constructionOptionMap.get(key) || null : null;
}

export function normalizeConstructionKey(value: unknown, fallback = "") {
  const direct = String(value ?? "").trim();
  if (!direct) return fallback;
  if (constructionOptionMap.has(direct)) return direct;
  return CONSTRUCTION_ALIASES.get(normalizeAlias(direct)) || fallback;
}

export function normalizeConstructionCategoryKey(value: unknown, fallback = "") {
  const direct = String(value ?? "").trim();
  if (!direct) return fallback;
  if (constructionCategoryMap.has(direct)) return direct;
  const normalized = normalizeAlias(direct);
  for (const category of ALL_CONSTRUCTION_CATEGORIES) {
    if (normalizeAlias(category.label) === normalized) {
      return category.key;
    }
  }
  return fallback;
}

export function getConstructionOption(value: unknown) {
  return resolveConstructionOption(value);
}

export function getConstructionCategory(value: unknown) {
  const key = normalizeConstructionCategoryKey(value);
  return key ? constructionCategoryMap.get(key) || null : null;
}

export function getConstructionLabel(value: unknown, fallback = "") {
  const option = getConstructionOption(value);
  return option?.label || fallback;
}

export function getConstructionCategoryKey(value: unknown, fallback = "") {
  const option = getConstructionOption(value);
  return option?.categoryKey || fallback;
}

export function getConstructionCategoryLabel(value: unknown, fallback = "") {
  const category = getConstructionCategory(value) || getConstructionCategory(getConstructionCategoryKey(value));
  return category?.label || fallback;
}

export function getConstructionSubtypeOptions(value: unknown) {
  const option = getConstructionOption(value);
  return option?.subtypeOptions ? [...option.subtypeOptions] : [];
}

export function getConstructionSubtypeLabel(value: unknown, fallback = "") {
  const option = getConstructionOption(value);
  return option?.subtypeLabel || fallback;
}

export function normalizeConstructionSubtype(
  constructionValue: unknown,
  subtypeValue: unknown,
  rawConstructionValue: unknown = constructionValue
) {
  const constructionKey = normalizeConstructionKey(constructionValue);
  if (!constructionKey) return "";

  const option = constructionOptionMap.get(constructionKey);
  if (!option?.subtypeOptions?.length) return "";

  const normalizedSubtype = normalizeAlias(subtypeValue);
  if (constructionKey === "pile_grillage") {
    return PILE_SUBTYPE_ALIASES.get(normalizedSubtype) || option.defaultSubtype || "";
  }

  if (constructionKey === "formwork") {
    const rawConstructionNormalized = normalizeAlias(rawConstructionValue);
    if (rawConstructionNormalized === normalizeAlias("temporary_formwork")) return "temporary";
    if (rawConstructionNormalized === normalizeAlias("permanent_formwork")) return "permanent";
    return FORMWORK_SUBTYPE_ALIASES.get(normalizedSubtype) || option.defaultSubtype || "";
  }

  const directMatch = option.subtypeOptions.find((subtype) => subtype.key === String(subtypeValue ?? "").trim());
  if (directMatch) return directMatch.key;

  const labelMatch = option.subtypeOptions.find((subtype) => normalizeAlias(subtype.label) === normalizedSubtype);
  return labelMatch?.key || option.defaultSubtype || "";
}

export function getConstructionSubtypeOptionLabel(
  constructionValue: unknown,
  subtypeValue: unknown,
  fallback = ""
) {
  const normalizedSubtype = normalizeConstructionSubtype(constructionValue, subtypeValue, constructionValue);
  if (!normalizedSubtype) return fallback;
  return (
    getConstructionSubtypeOptions(constructionValue).find((option) => option.key === normalizedSubtype)?.label ||
    fallback
  );
}

export function getConstructionModuleBehavior(
  value: unknown,
  module: ConstructionBehaviorModule,
  subtypeValue: unknown = ""
) {
  const option = getConstructionOption(value);
  if (!option) {
    return unsupportedBehavior();
  }

  const baseBehavior = option.modules[module] || unsupportedBehavior();
  const subtypeKey = normalizeConstructionSubtype(option.key, subtypeValue, value);
  const subtypeOverride = subtypeKey ? option.subtypeBehaviors?.[subtypeKey]?.[module] : null;
  const merged = applyInspectionRegistryStatus(
    option.key,
    module,
    subtypeKey,
    mergeModuleBehavior(baseBehavior, subtypeOverride || undefined)
  );
  if (typeof merged.supported !== "boolean") {
    merged.supported = merged.profile !== "unsupported";
  }
  return merged;
}

export interface ConstructionEntityLabels {
  singular: string;
  singularGenitive: string;
  plural: string;
  pluralGenitive: string;
  addText: string;
  requiredText: string;
}

const ENTITY_LABELS_BY_DISPLAY_LABEL: Readonly<Record<string, ConstructionEntityLabels>> = Object.freeze({
  "Стена": Object.freeze({
    singular: "Стена",
    singularGenitive: "стены",
    plural: "Стены",
    pluralGenitive: "стен",
    addText: "стену",
    requiredText: "одну стену"
  }),
  "Пилон": Object.freeze({
    singular: "Пилон",
    singularGenitive: "пилона",
    plural: "Пилоны",
    pluralGenitive: "пилонов",
    addText: "пилон",
    requiredText: "один пилон"
  }),
  "Шахта лифта": Object.freeze({
    singular: "Стена шахты",
    singularGenitive: "стены шахты",
    plural: "Стены",
    pluralGenitive: "стен",
    addText: "стену",
    requiredText: "одну стену"
  })
});

export function getConstructionEntityLabels(
  value: unknown,
  module: ConstructionBehaviorModule = "display",
  subtypeValue: unknown = ""
): ConstructionEntityLabels {
  const behavior = getConstructionModuleBehavior(value, module, subtypeValue);
  const displayLabel = behavior.journalDisplayLabel || getConstructionLabel(value, "Стена");
  return ENTITY_LABELS_BY_DISPLAY_LABEL[displayLabel] || ENTITY_LABELS_BY_DISPLAY_LABEL["Стена"];
}

export function getConstructionProfile(
  value: unknown,
  module: ConstructionBehaviorModule,
  fallback: ConstructionBehaviorProfile = "unsupported"
) {
  const option = getConstructionOption(value);
  if (option?.modules[module]?.profile) {
    return option.modules[module].profile;
  }
  const legacyProfile = getProfileFromLegacyValue(value);
  return legacyProfile || fallback;
}

export function isConstructionProfile(
  value: unknown,
  module: ConstructionBehaviorModule,
  profile: ConstructionBehaviorProfile
) {
  return getConstructionProfile(value, module) === profile;
}

export function isConstructionProfileIn(
  value: unknown,
  module: ConstructionBehaviorModule,
  profiles: ConstructionBehaviorProfile[]
) {
  const currentProfile = getConstructionProfile(value, module);
  return profiles.includes(currentProfile);
}

export function isConstructionSupportedInModule(
  value: unknown,
  module: ConstructionBehaviorModule,
  subtypeValue: unknown = ""
) {
  return getConstructionModuleBehavior(value, module, subtypeValue).supported !== false;
}

export function getConstructionModuleFallbackMessage(
  value: unknown,
  module: ConstructionBehaviorModule,
  fallback = "",
  subtypeValue: unknown = ""
) {
  const option = getConstructionOption(value);
  const label = option?.label || String(value || "").trim() || "Выбранная конструкция";
  const behavior = getConstructionModuleBehavior(value, module, subtypeValue);
  const message =
    behavior.message ||
    MODULE_FALLBACK_MESSAGES[module] ||
    fallback ||
    "Для этой конструкции модуль находится в разработке.";
  return `${label}: ${message}`;
}

export function getLegacyConstructionType(value: unknown, fallback = LEGACY_GENERIC_CONSTRUCTION) {
  const option = getConstructionOption(value);
  if (option?.legacyType) return option.legacyType;

  const displayProfile = getConstructionProfile(value, "display", "unsupported");
  if (PROFILE_TO_LEGACY_TYPE[displayProfile]) {
    return PROFILE_TO_LEGACY_TYPE[displayProfile];
  }

  const normalized = normalizeAlias(value);
  if (
    normalized === normalizeAlias("Плита") ||
    normalized === normalizeAlias("Колонна") ||
    normalized === normalizeAlias("Стена") ||
    normalized === normalizeAlias("Лестница") ||
    normalized === normalizeAlias("Балка") ||
    normalized === normalizeAlias(LEGACY_GENERIC_CONSTRUCTION)
  ) {
    return String(value).trim();
  }

  return fallback;
}

export function getConstructionSelectionState(
  value: unknown,
  fallback = "floor_slab",
  subtypeValue: unknown = ""
) {
  const key = normalizeConstructionKey(value, fallback);
  const option = getConstructionOption(key) || getConstructionOption(fallback);
  const subtypeKey = normalizeConstructionSubtype(option?.key || key, subtypeValue, value);
  return {
    key: option?.key || fallback,
    label: option?.label || "",
    categoryKey: option?.categoryKey || "",
    categoryLabel: option ? getConstructionCategoryLabel(option.categoryKey) : "",
    legacyType: option?.legacyType || getLegacyConstructionType(option?.key || fallback),
    profiles: option ? buildProfiles(option.modules) : null,
    subtypeKey,
    subtypeLabel: getConstructionSubtypeOptionLabel(option?.key || key, subtypeKey, ""),
    subtypeControlLabel: option?.subtypeLabel || ""
  };
}

export function getConstructionOptionsByCategory(categoryKey: unknown, includeHidden = false) {
  const normalizedCategoryKey = normalizeConstructionCategoryKey(categoryKey);
  return ALL_CONSTRUCTION_OPTIONS.filter((option) => {
    if (option.categoryKey !== normalizedCategoryKey) return false;
    return includeHidden || option.visible !== false;
  }).map((option) => ({
    key: option.key,
    label: option.label,
    categoryKey: option.categoryKey,
    legacyType: option.legacyType,
    profiles: buildProfiles(option.modules)
  }));
}

export function isFoundationConstruction(value: unknown) {
  return getConstructionCategoryKey(value) === "foundation";
}

export function isConstructionVisibleInSelector(value: unknown) {
  const option = getConstructionOption(value);
  return option?.visible !== false;
}
