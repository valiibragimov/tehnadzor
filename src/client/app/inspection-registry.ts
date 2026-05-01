import { REGULATORY_DOCS, TOLERANCES } from "../config.js";

export type InspectionModule = "geodesy" | "reinforcement" | "geometry" | "strength";
export type InspectionStatus = "object" | "factory" | "notApplicable";
export type InspectionFieldType = "text" | "number" | "select" | "checkbox" | "textarea";
export type InspectionRuleKind = "tolerance" | "strictMatch" | "formula" | "manual";

export interface InspectionField {
  key: string;
  label: string;
  type: InspectionFieldType;
  unit?: string;
  required?: boolean;
  uiKey?: string;
  visible?: boolean;
  axisMode?: InspectionLocationMode;
  options?: readonly { value: string; label: string }[];
}

export interface InspectionTolerance {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  mode?: "absolute" | "strict" | "formula" | "manual";
  normativeDocKeys?: readonly string[];
}

export interface InspectionNormativeDoc {
  key: string;
  document: string;
  clause?: string;
  tolerance?: string;
  url?: string;
}

export interface InspectionRule {
  key: string;
  label: string;
  kind: InspectionRuleKind;
  fieldKeys?: readonly string[];
  toleranceKey?: string;
  normativeDocKeys?: readonly string[];
  formula?: string;
  resultMap?: Readonly<Record<string, string>>;
}

export type InspectionLocationMode =
  | "none"
  | "single_axis"
  | "plate_range"
  | "strip_foundation"
  | "wall_binding";

export type InspectionElementSheetMode =
  | "none"
  | "columns"
  | "walls"
  | "beams"
  | "stairs"
  | "formwork";

export interface InspectionFieldBehavior {
  floorVisible?: boolean;
  floorRequired?: boolean;
  locationMode?: InspectionLocationMode;
  elementSheetMode?: InspectionElementSheetMode;
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

export interface ConstructionInspectionModuleConfig {
  module: InspectionModule;
  status: InspectionStatus;
  fields: readonly InspectionField[];
  tolerances: readonly InspectionTolerance[];
  normativeDocs: readonly InspectionNormativeDoc[];
  resultRules: readonly InspectionRule[];
  infoMessage?: string;
  fieldBehavior?: InspectionFieldBehavior;
}

export interface ConstructionInspectionConfig {
  category: string;
  construction: string;
  subtype?: string;
  modules: Readonly<Record<InspectionModule, ConstructionInspectionModuleConfig>>;
  subtypeOverrides?: Readonly<Record<string, Partial<Record<InspectionModule, Partial<ConstructionInspectionModuleConfig>>>>>;
}

type ModuleInput = InspectionModule | "geo";

export const INSPECTION_STATUS_LABELS: Readonly<Record<InspectionStatus, string>> = Object.freeze({
  object: "объектовый контроль",
  factory: "заводской контроль",
  notApplicable: "не применяется"
});

const DOCS = Object.freeze({
  sp70Table51: Object.freeze({
    key: "SP_70_13330_2012_TABLE_5_1",
    document: "СП 70.13330.2012",
    clause: "табл. 5.1",
    url: REGULATORY_DOCS.SP_70_13330_2012
  }),
  sp126: Object.freeze({
    key: "SP_126_13330_2017_SECTIONS_5_8",
    document: "СП 126.13330.2017",
    clause: "разд. 5-8",
    tolerance: "геодезические работы и порядок измерений",
    url: REGULATORY_DOCS.SP_126_13330_2017
  }),
  gostRebar: Object.freeze({
    key: "GOST_R_57997_2017_SECTION_5",
    document: "ГОСТ Р 57997-2017",
    clause: "разд. 5",
    url: REGULATORY_DOCS.GOST_R_57997_2017
  }),
  gost9561: Object.freeze({
    key: "GOST_9561_2016_SECTIONS_5_8",
    document: "ГОСТ 9561-2016",
    clause: "разд. 5-8",
    url: REGULATORY_DOCS.GOST_9561_2016
  }),
  gost18105: Object.freeze({
    key: "GOST_18105_2018_5_6",
    document: "ГОСТ 18105-2018",
    clause: "п. 5.6",
    tolerance: "R(t)=R28×lg(t)/lg(28)",
    url: REGULATORY_DOCS.GOST_18105_2018
  }),
  sp371: Object.freeze({
    key: "SP_371_1325800_2017",
    document: "СП 371.1325800.2017",
    clause: "разд. 6-7"
  }),
  gost34329: Object.freeze({
    key: "GOST_34329_2017",
    document: "ГОСТ 34329-2017",
    clause: "разд. 5-7"
  })
} as const);

const FIELDS = Object.freeze({
  axesRange: { key: "axesRange", label: "Оси / местоположение", type: "text", required: true },
  floor: { key: "floor", label: "Этаж", type: "text", required: true },
  stairName: { key: "stairName", label: "Наименование лестницы", type: "text" },
  openingPoints: { key: "openingPoints", label: "Координаты характерных точек проёма", type: "text" },
  marking: { key: "marking", label: "Маркировка", type: "text" },
  wallBindingType: { key: "wallBindingType", label: "Тип привязки", type: "select" },
  wallLetterAxis: { key: "wallLetterAxis", label: "Буквенная ось", type: "select" },
  wallNumberAxis1: { key: "wallNumberAxis1", label: "Цифровая ось 1", type: "select" },
  wallNumberAxis2: { key: "wallNumberAxis2", label: "Цифровая ось 2", type: "select" },
  wallNumberAxis: { key: "wallNumberAxis", label: "Цифровая ось", type: "select" },
  wallLetterAxis1: { key: "wallLetterAxis1", label: "Буквенная ось 1", type: "select" },
  wallLetterAxis2: { key: "wallLetterAxis2", label: "Буквенная ось 2", type: "select" },
  pileElement: {
    key: "constructionPileElement",
    label: "Проверяемый элемент",
    type: "select",
    options: [
      { value: "pile", label: "Свая" },
      { value: "grillage", label: "Ростверк" }
    ]
  },
  projX: { key: "projX", label: "Проектная координата X", type: "number", unit: "мм" },
  factX: { key: "factX", label: "Фактическая координата X", type: "number", unit: "мм" },
  projY: { key: "projY", label: "Проектная координата Y", type: "number", unit: "мм" },
  factY: { key: "factY", label: "Фактическая координата Y", type: "number", unit: "мм" },
  projH: { key: "projH", label: "Проектная отметка H", type: "number", unit: "мм" },
  factH: { key: "factH", label: "Фактическая отметка H", type: "number", unit: "мм" },
  geoFlatnessActual: { key: "geoPlateFlatnessActual", label: "Фактическое отклонение от плоскостности", type: "number", unit: "мм" },
  geoFlatnessBase: { key: "geoPlateFlatnessBase", label: "База измерения", type: "select" },
  geoFlatnessClass: { key: "geoPlateFlatnessClass", label: "Класс поверхности / основание", type: "select" },
  geoFlatnessTolerance: { key: "geoPlateFlatnessTolerance", label: "Предельное отклонение", type: "number", unit: "мм" },
  projHeight: { key: "projPlateHeight", label: "Проектная высота / толщина", type: "number", unit: "мм" },
  factHeight: { key: "factPlateHeight", label: "Фактическая высота / толщина", type: "number", unit: "мм" },
  flatness: { key: "factPlateFlatness", label: "Фактическая плоскостность", type: "number", unit: "мм" },
  projOpeningSizes: { key: "projOpeningSizes", label: "Проектные размеры проёмов", type: "text" },
  factOpeningSizes: { key: "factOpeningSizes", label: "Фактические размеры проёмов", type: "text" },
  projBeamWidth: { key: "projBeamWidth", label: "Проектная ширина балки", type: "number", unit: "мм" },
  factBeamWidth: { key: "factBeamWidth", label: "Фактическая ширина балки", type: "number", unit: "мм" },
  projBeamHeight: { key: "projBeamHeight", label: "Проектная высота балки", type: "number", unit: "мм" },
  factBeamHeight: { key: "factBeamHeight", label: "Фактическая высота балки", type: "number", unit: "мм" },
  projStepHeight: { key: "projStepHeight", label: "Проектная высота ступени", type: "number", unit: "мм" },
  factStepHeight: { key: "factStepHeight", label: "Фактическая высота ступени", type: "number", unit: "мм" },
  projStepWidth: { key: "projStepWidth", label: "Проектная ширина проступи", type: "number", unit: "мм" },
  factStepWidth: { key: "factStepWidth", label: "Фактическая ширина проступи", type: "number", unit: "мм" },
  projFlightWidth: { key: "projFlightWidth", label: "Проектная ширина марша", type: "number", unit: "мм" },
  factFlightWidth: { key: "factFlightWidth", label: "Фактическая ширина марша", type: "number", unit: "мм" },
  projSize1: { key: "projSize1", label: "Проектный размер сечения 1", type: "number", unit: "мм" },
  factSize1: { key: "factSize1", label: "Фактический размер сечения 1", type: "number", unit: "мм" },
  projSize2: { key: "projSize2", label: "Проектный размер сечения 2", type: "number", unit: "мм" },
  factSize2: { key: "factSize2", label: "Фактический размер сечения 2", type: "number", unit: "мм" },
  projThick: { key: "projThick", label: "Проектная толщина", type: "number", unit: "мм" },
  factThick: { key: "factThick", label: "Фактическая толщина", type: "number", unit: "мм" },
  vertDev: { key: "vertDev", label: "Фактическое отклонение по вертикали", type: "number", unit: "мм" },
  factWallFlatness: { key: "factWallFlatness", label: "Фактическая плоскостность", type: "number", unit: "мм" },
  projOpeningHeight: { key: "projOpeningHeight", label: "Проектная высота расположения проёмов", type: "number", unit: "мм" },
  factOpeningHeight: { key: "factOpeningHeight", label: "Фактическая высота расположения проёмов", type: "number", unit: "мм" },
  projDia: { key: "projDia", label: "Проектный диаметр арматуры", type: "number", unit: "мм" },
  factDia: { key: "factDia", label: "Фактический диаметр арматуры", type: "number", unit: "мм" },
  projStep: { key: "projStep", label: "Проектный шаг арматуры", type: "number", unit: "мм" },
  factStep: { key: "factStep", label: "Фактический шаг арматуры", type: "number", unit: "мм" },
  projCover: { key: "projCover", label: "Проектный защитный слой", type: "number", unit: "мм" },
  factCover: { key: "factCover", label: "Фактический защитный слой", type: "number", unit: "мм" },
  projHoopsStep: { key: "projHoopsStep", label: "Проектный шаг хомутов", type: "number", unit: "мм" },
  factHoopsStep: { key: "factHoopsStep", label: "Фактический шаг хомутов", type: "number", unit: "мм" },
  concreteMark: { key: "mark", label: "Класс / марка бетона", type: "text", required: true },
  concreteAge: { key: "days", label: "Возраст бетона", type: "number", unit: "сут", required: true },
  concreteActual: { key: "actual", label: "Фактическая прочность", type: "number", unit: "МПа", required: true },
  formworkType: { key: "formworkType", label: "Тип опалубки", type: "select" },
  formworkFloor: { key: "floor", label: "Этаж", type: "text" },
  formworkElementName: { key: "formworkElementName", label: "Наименование элемента", type: "text" },
  formworkArea: { key: "formworkArea", label: "Участок / захватка", type: "text" },
  formworkProjHeight: { key: "formworkProjHeight", label: "Проектная высота", type: "number", unit: "мм" },
  formworkFactHeight: { key: "formworkFactHeight", label: "Фактическая высота", type: "number", unit: "мм" },
  formworkProjWidth: { key: "formworkProjWidth", label: "Проектная ширина", type: "number", unit: "мм" },
  formworkFactWidth: { key: "formworkFactWidth", label: "Фактическая ширина", type: "number", unit: "мм" },
  formworkProjThickness: { key: "formworkProjThickness", label: "Проектная толщина", type: "number", unit: "мм" },
  formworkFactThickness: { key: "formworkFactThickness", label: "Фактическая толщина", type: "number", unit: "мм" },
  formworkVerticalDeviation: { key: "formworkVerticalDeviation", label: "Отклонение от вертикали", type: "number", unit: "мм" },
  formworkVerticalTolerance: { key: "formworkVerticalTolerance", label: "Допуск по вертикали", type: "number", unit: "мм" },
  formworkBasis: { key: "formworkBasis", label: "Класс / основание", type: "select" },
  formworkResult: { key: "formworkResult", label: "Результат", type: "text" },
  note: { key: "note", label: "Примечание", type: "textarea" }
} as const satisfies Readonly<Record<string, InspectionField>>);

const TOLERANCE_LIBRARY = Object.freeze({
  geoPlan: {
    key: "geoPlan",
    label: "Координаты X/Y",
    value: TOLERANCES.PLAN_XY,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  geoHeight: {
    key: "geoHeight",
    label: "Отметка H",
    value: TOLERANCES.HEIGHT,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  plateHeight: {
    key: "plateHeight",
    label: "Толщина / высота плиты",
    value: TOLERANCES.PLATE_HEIGHT,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.gost9561.key, DOCS.sp70Table51.key]
  },
  plateFlatness: {
    key: "plateFlatness",
    label: "Плоскостность",
    value: TOLERANCES.PLATE_FLATNESS,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  openingSize: {
    key: "openingSize",
    label: "Размеры проёмов",
    value: TOLERANCES.OPENING_SIZE,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  openingHeight: {
    key: "openingHeight",
    label: "Высота расположения проёмов",
    value: TOLERANCES.OPENING_HEIGHT,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  columnSize: {
    key: "columnSize",
    label: "Размеры сечения колонны",
    value: TOLERANCES.COLUMN_SIZE,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  columnVerticality: {
    key: "columnVerticality",
    label: "Вертикальность колонны",
    value: TOLERANCES.COLUMN_VERT,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  wallThickness: {
    key: "wallThickness",
    label: "Толщина стены / пилона",
    value: TOLERANCES.WALL_THICK,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  wallVerticality: {
    key: "wallVerticality",
    label: "Вертикальность стены / пилона",
    value: TOLERANCES.WALL_VERT,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  wallFlatness: {
    key: "wallFlatness",
    label: "Плоскостность стены / пилона",
    value: TOLERANCES.WALL_FLATNESS || TOLERANCES.PLATE_FLATNESS,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  beamSize: {
    key: "beamSize",
    label: "Размеры сечения балки",
    value: TOLERANCES.BEAM_SIZE,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  stairStepHeight: {
    key: "stairStepHeight",
    label: "Высота ступени",
    value: TOLERANCES.STAIR_STEP_HEIGHT,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  stairStepWidth: {
    key: "stairStepWidth",
    label: "Ширина проступи / марша",
    value: TOLERANCES.STAIR_STEP_WIDTH,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  rebarDiameter: {
    key: "rebarDiameter",
    label: "Диаметр арматуры",
    value: null,
    unit: "мм",
    mode: "strict",
    normativeDocKeys: [DOCS.gostRebar.key]
  },
  rebarStep: {
    key: "rebarStep",
    label: "Шаг арматуры",
    value: TOLERANCES.STEP,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.gostRebar.key]
  },
  rebarCover: {
    key: "rebarCover",
    label: "Защитный слой",
    value: TOLERANCES.COVER,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.sp70Table51.key]
  },
  hoopsStep: {
    key: "hoopsStep",
    label: "Шаг хомутов",
    value: TOLERANCES.HOOPS_STEP,
    unit: "мм",
    mode: "absolute",
    normativeDocKeys: [DOCS.gostRebar.key]
  },
  concreteStrength: {
    key: "concreteStrength",
    label: "Прочность бетона",
    value: null,
    unit: "МПа",
    mode: "formula",
    normativeDocKeys: [DOCS.gost18105.key]
  },
  formworkManual: {
    key: "formworkManual",
    label: "Отклонение от вертикали опалубки",
    value: null,
    unit: "мм",
    mode: "manual",
    normativeDocKeys: [DOCS.sp371.key, DOCS.gost34329.key, DOCS.sp70Table51.key]
  }
} as const satisfies Readonly<Record<string, InspectionTolerance>>);

function withToleranceText<T extends InspectionNormativeDoc>(
  doc: T,
  tolerance: string
): InspectionNormativeDoc {
  return { ...doc, tolerance };
}

function moduleConfig(
  module: InspectionModule,
  status: InspectionStatus,
  fields: readonly InspectionField[],
  tolerances: readonly InspectionTolerance[],
  normativeDocs: readonly InspectionNormativeDoc[],
  resultRules: readonly InspectionRule[],
  infoMessage?: string,
  fieldBehavior?: InspectionFieldBehavior
): ConstructionInspectionModuleConfig {
  return Object.freeze({
    module,
    status,
    fields: Object.freeze([...fields]),
    tolerances: Object.freeze([...tolerances]),
    normativeDocs: Object.freeze([...normativeDocs]),
    resultRules: Object.freeze([...resultRules]),
    infoMessage,
    fieldBehavior: fieldBehavior ? Object.freeze({ ...fieldBehavior }) : undefined
  });
}

const geodesyObjectMessage = "Объектовый контроль: проверяются координаты и отметки конструкции по исполнительной геодезии.";
const factoryPileGeometryMessage =
  "Заводской контроль: геометрические параметры забивных железобетонных и винтовых свай подтверждаются заводом-изготовителем. На объекте проверяется положение свай и документация поставки.";
const factoryPileRebarMessage =
  "Заводской контроль: армирование забивных железобетонных и винтовых свай проверяется отделом технического контроля производителя. На объекте контролируются паспорта изделий и соответствие партии.";

const foundationFieldBehavior = Object.freeze({
  floorVisible: false,
  floorRequired: false,
  elementSheetMode: "none",
  showOpeningPoints: false,
  showStairName: false,
  maxWalls: null
} satisfies InspectionFieldBehavior);

const foundationGeodesyBehavior = Object.freeze({
  ...foundationFieldBehavior,
  locationMode: "plate_range",
  showGeoFlatnessCheck: false
} satisfies InspectionFieldBehavior);

const stripFoundationGeodesyBehavior = Object.freeze({
  ...foundationGeodesyBehavior,
  locationMode: "strip_foundation"
} satisfies InspectionFieldBehavior);

const foundationPlateGeometryBehavior = Object.freeze({
  ...foundationFieldBehavior,
  locationMode: "plate_range",
  showOpeningSizes: true,
  showPlateFlatness: true,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false
} satisfies InspectionFieldBehavior);

const stripGeometryBehavior = Object.freeze({
  ...foundationFieldBehavior,
  locationMode: "strip_foundation",
  showOpeningSizes: true,
  showPlateFlatness: false,
  showCommonWidth: false,
  showCommonVerticalDeviation: false,
  showCommonPlaneDeviation: false,
  showNote: false
} satisfies InspectionFieldBehavior);

const foundationReinforcementBehavior = Object.freeze({
  ...foundationFieldBehavior,
  locationMode: "plate_range",
  showReinforcementCommonFields: true,
  showReinforcementHoopsStep: false
} satisfies InspectionFieldBehavior);

const stripReinforcementBehavior = Object.freeze({
  ...foundationReinforcementBehavior,
  locationMode: "strip_foundation",
  showReinforcementHoopsStep: true
} satisfies InspectionFieldBehavior);

const pileObjectBehavior = Object.freeze({
  ...foundationFieldBehavior,
  locationMode: "none",
  showOpeningSizes: true,
  showPlateFlatness: false,
  showReinforcementCommonFields: true,
  showReinforcementHoopsStep: false
} satisfies InspectionFieldBehavior);

const foundationStrengthBehavior = Object.freeze({
  ...foundationFieldBehavior,
  locationMode: "plate_range"
} satisfies InspectionFieldBehavior);

const verticalColumnBehavior = Object.freeze({
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
  showReinforcementHoopsStep: false
} satisfies InspectionFieldBehavior);

const verticalWallBehavior = Object.freeze({
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
  geometryCommonProjectWidthLabel: "Проектная толщина стены",
  geometryCommonFactWidthLabel: "Фактическая толщина стены",
  geometryCommonVerticalDeviationLabel: "Отклонение стены по вертикали"
} satisfies InspectionFieldBehavior);

const verticalPylonBehavior = Object.freeze({
  ...verticalWallBehavior,
  geometryFlatnessLabel: "Фактическая плоскостность пилона",
  geometryCommonProjectWidthLabel: "Проектная толщина пилона",
  geometryCommonFactWidthLabel: "Фактическая толщина пилона",
  geometryCommonVerticalDeviationLabel: "Отклонение пилона по вертикали",
  journalDisplayLabel: "Пилон"
} satisfies InspectionFieldBehavior);

const horizontalSlabBehavior = Object.freeze({
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
  geometryFlatnessLabel: "Фактическая плоскостность плиты"
} satisfies InspectionFieldBehavior);

const horizontalSlabGeodesyBehavior = Object.freeze({
  ...horizontalSlabBehavior,
  showGeoFlatnessCheck: true,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showReinforcementCommonFields: false
} satisfies InspectionFieldBehavior);

const horizontalSlabReinforcementBehavior = Object.freeze({
  ...horizontalSlabBehavior,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showReinforcementCommonFields: true
} satisfies InspectionFieldBehavior);

const horizontalSlabStrengthBehavior = Object.freeze({
  ...horizontalSlabBehavior,
  showOpeningSizes: false,
  showPlateFlatness: false,
  showReinforcementCommonFields: false
} satisfies InspectionFieldBehavior);

const horizontalBeamBehavior = Object.freeze({
  floorVisible: true,
  floorRequired: true,
  locationMode: "strip_foundation",
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
  journalDisplayLabel: "Балка"
} satisfies InspectionFieldBehavior);

const elevatorShaftBehavior = Object.freeze({
  ...verticalWallBehavior,
  locationMode: "plate_range",
  showOpeningPoints: true,
  maxWalls: 4,
  geometryFlatnessLabel: "Фактическая плоскостность стены шахты",
  geometryCommonProjectWidthLabel: "Проектная толщина стены шахты",
  geometryCommonFactWidthLabel: "Фактическая толщина стены шахты",
  geometryCommonVerticalDeviationLabel: "Отклонение стены шахты по вертикали",
  journalDisplayLabel: "Шахта лифта"
} satisfies InspectionFieldBehavior);

const stairCoreBehavior = Object.freeze({
  floorVisible: true,
  floorRequired: true,
  locationMode: "plate_range",
  elementSheetMode: "stairs",
  showOpeningPoints: false,
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
  journalDisplayLabel: "Лестничная клетка"
} satisfies InspectionFieldBehavior);

const formworkGeometryBehavior = Object.freeze({
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
  geometryFlatnessLabel: "Результат",
  geometryCommonProjectWidthLabel: "Проектная ширина",
  geometryCommonFactWidthLabel: "Фактическая ширина",
  geometryCommonVerticalDeviationLabel: "Отклонение от вертикали",
  geometryCommonPlaneDeviationLabel: "Результат",
  journalDisplayLabel: "Опалубка"
} satisfies InspectionFieldBehavior);

const geodesyFoundationModule = moduleConfig(
  "geodesy",
  "object",
  [FIELDS.axesRange, FIELDS.projX, FIELDS.factX, FIELDS.projY, FIELDS.factY, FIELDS.projH, FIELDS.factH],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм"),
    DOCS.sp126
  ],
  [
    {
      key: "geo_xy_h_within_tolerance",
      label: "Координаты и отметки в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projX", "factX", "projY", "factY", "projH", "factH"],
      toleranceKey: "geoPlan",
      normativeDocKeys: [DOCS.sp70Table51.key, DOCS.sp126.key]
    }
  ],
  geodesyObjectMessage,
  foundationGeodesyBehavior
);

const geodesyStripFoundationModule = moduleConfig(
  "geodesy",
  "object",
  [FIELDS.axesRange, FIELDS.projX, FIELDS.factX, FIELDS.projY, FIELDS.factY, FIELDS.projH, FIELDS.factH],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм"),
    DOCS.sp126
  ],
  geodesyFoundationModule.resultRules,
  geodesyObjectMessage,
  stripFoundationGeodesyBehavior
);

const reinforcementPlateModule = moduleConfig(
  "reinforcement",
  "object",
  [FIELDS.axesRange, FIELDS.projDia, FIELDS.factDia, FIELDS.projStep, FIELDS.factStep, FIELDS.projCover, FIELDS.factCover],
  [TOLERANCE_LIBRARY.rebarDiameter, TOLERANCE_LIBRARY.rebarStep, TOLERANCE_LIBRARY.rebarCover],
  [
    withToleranceText(DOCS.gostRebar, "диаметр строго; шаг ±20 мм"),
    withToleranceText(DOCS.sp70Table51, "защитный слой ±5 мм")
  ],
  [
    {
      key: "rebar_diameter_strict",
      label: "Диаметр соответствует проекту",
      kind: "strictMatch",
      fieldKeys: ["projDia", "factDia"],
      toleranceKey: "rebarDiameter",
      normativeDocKeys: [DOCS.gostRebar.key]
    },
    {
      key: "rebar_step_within_tolerance",
      label: "Шаг арматуры в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projStep", "factStep"],
      toleranceKey: "rebarStep",
      normativeDocKeys: [DOCS.gostRebar.key]
    },
    {
      key: "rebar_cover_within_tolerance",
      label: "Защитный слой в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projCover", "factCover"],
      toleranceKey: "rebarCover",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: армирование проверяется до бетонирования по проекту, исполнительной схеме и фактическим замерам.",
  foundationReinforcementBehavior
);

const geometryPlateModule = moduleConfig(
  "geometry",
  "object",
  [FIELDS.axesRange, FIELDS.projHeight, FIELDS.factHeight, FIELDS.flatness, FIELDS.projOpeningSizes, FIELDS.factOpeningSizes],
  [TOLERANCE_LIBRARY.plateHeight, TOLERANCE_LIBRARY.plateFlatness, TOLERANCE_LIBRARY.openingSize],
  [
    withToleranceText(DOCS.gost9561, "высота ±5 мм"),
    withToleranceText(DOCS.sp70Table51, "плоскостность ±5 мм; размеры проёмов ±8 мм")
  ],
  [
    {
      key: "plate_height_within_tolerance",
      label: "Высота / толщина в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projPlateHeight", "factPlateHeight"],
      toleranceKey: "plateHeight",
      normativeDocKeys: [DOCS.gost9561.key, DOCS.sp70Table51.key]
    },
    {
      key: "plate_flatness_within_tolerance",
      label: "Плоскостность в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["factPlateFlatness"],
      toleranceKey: "plateFlatness",
      normativeDocKeys: [DOCS.sp70Table51.key]
    },
    {
      key: "opening_size_within_tolerance",
      label: "Проёмы в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projOpeningSizes", "factOpeningSizes"],
      toleranceKey: "openingSize",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: геометрия проверяется по фактическим измерениям после устройства конструкции.",
  foundationPlateGeometryBehavior
);

const strengthConcreteModule = moduleConfig(
  "strength",
  "object",
  [FIELDS.axesRange, FIELDS.concreteMark, FIELDS.concreteAge, FIELDS.concreteActual],
  [TOLERANCE_LIBRARY.concreteStrength],
  [DOCS.gost18105],
  [
    {
      key: "concrete_strength_age_formula",
      label: "Фактическая прочность не ниже нормативной на дату контроля",
      kind: "formula",
      fieldKeys: ["mark", "days", "actual"],
      toleranceKey: "concreteStrength",
      normativeDocKeys: [DOCS.gost18105.key],
      formula: "R(t)=R28*lg(t)/lg(28)"
    }
  ],
  "Объектовый контроль: прочность бетона проверяется по возрасту бетона и фактическим результатам испытаний.",
  foundationStrengthBehavior
);

const makeVerticalStrengthModule = (
  entityLabel: string,
  fieldBehavior: InspectionFieldBehavior
) => moduleConfig(
  "strength",
  "object",
  [FIELDS.floor, FIELDS.axesRange, FIELDS.marking, FIELDS.concreteMark, FIELDS.concreteAge, FIELDS.concreteActual],
  [TOLERANCE_LIBRARY.concreteStrength],
  [DOCS.gost18105],
  strengthConcreteModule.resultRules,
  `Объектовый контроль: прочность бетона конструкции "${entityLabel}" проверяется по возрасту бетона и фактическим результатам испытаний.`,
  fieldBehavior
);

const geodesyColumnModule = moduleConfig(
  "geodesy",
  "object",
  [
    FIELDS.floor,
    FIELDS.marking,
    FIELDS.axesRange,
    FIELDS.projX,
    FIELDS.factX,
    FIELDS.projY,
    FIELDS.factY,
    FIELDS.projH,
    FIELDS.factH
  ],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм"),
    DOCS.sp126
  ],
  [
    {
      key: "column_geo_position_within_tolerance",
      label: "Положение колонны в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["floor", "marking", "projX", "factX", "projY", "factY", "projH", "factH"],
      toleranceKey: "geoPlan",
      normativeDocKeys: [DOCS.sp70Table51.key, DOCS.sp126.key]
    }
  ],
  "Объектовый контроль: положение колонны проверяется по маркировке, осям, координатам и отметке.",
  verticalColumnBehavior
);

const makeGeodesyWallModule = (
  entityLabel: string,
  entityPlural: string,
  fieldBehavior: InspectionFieldBehavior
) => moduleConfig(
  "geodesy",
  "object",
  [
    FIELDS.floor,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projX,
    FIELDS.factX,
    FIELDS.projY,
    FIELDS.factY,
    FIELDS.projH,
    FIELDS.factH
  ],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм"),
    DOCS.sp126
  ],
  [
    {
      key: `${entityLabel.toLocaleLowerCase("ru")}_geo_position_within_tolerance`,
      label: `Положение ${entityPlural.toLocaleLowerCase("ru")} в пределах допуска`,
      kind: "tolerance",
      fieldKeys: ["floor", "wallBindingType", "projX", "factX", "projY", "factY", "projH", "factH"],
      toleranceKey: "geoPlan",
      normativeDocKeys: [DOCS.sp70Table51.key, DOCS.sp126.key]
    }
  ],
  `Объектовый контроль: положение конструкции "${entityLabel}" проверяется по этажу, осевой привязке, координатам и отметкам.`,
  fieldBehavior
);

const reinforcementColumnModule = moduleConfig(
  "reinforcement",
  "object",
  [
    FIELDS.floor,
    FIELDS.marking,
    FIELDS.projDia,
    FIELDS.factDia,
    FIELDS.projStep,
    FIELDS.factStep,
    FIELDS.projCover,
    FIELDS.factCover,
    FIELDS.projHoopsStep,
    FIELDS.factHoopsStep
  ],
  [
    TOLERANCE_LIBRARY.rebarDiameter,
    TOLERANCE_LIBRARY.rebarStep,
    TOLERANCE_LIBRARY.rebarCover,
    TOLERANCE_LIBRARY.hoopsStep
  ],
  [
    withToleranceText(DOCS.gostRebar, "диаметр строго; шаг/хомуты ±20 мм"),
    withToleranceText(DOCS.sp70Table51, "защитный слой ±5 мм")
  ],
  [
    ...reinforcementPlateModule.resultRules,
    {
      key: "column_hoops_step_within_tolerance",
      label: "Шаг хомутов колонны в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projHoopsStep", "factHoopsStep"],
      toleranceKey: "hoopsStep",
      normativeDocKeys: [DOCS.gostRebar.key]
    }
  ],
  "Объектовый контроль: армирование колонны проверяется до бетонирования по маркировке, диаметрам, шагу, хомутам и защитному слою.",
  verticalColumnBehavior
);

const makeReinforcementWallModule = (
  entityLabel: string,
  fieldBehavior: InspectionFieldBehavior
) => moduleConfig(
  "reinforcement",
  "object",
  [
    FIELDS.floor,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projDia,
    FIELDS.factDia,
    FIELDS.projStep,
    FIELDS.factStep,
    FIELDS.projCover,
    FIELDS.factCover
  ],
  [TOLERANCE_LIBRARY.rebarDiameter, TOLERANCE_LIBRARY.rebarStep, TOLERANCE_LIBRARY.rebarCover],
  reinforcementPlateModule.normativeDocs,
  reinforcementPlateModule.resultRules,
  `Объектовый контроль: армирование конструкции "${entityLabel}" проверяется до бетонирования по осевой привязке, диаметрам, шагу и защитному слою.`,
  fieldBehavior
);

const geometryColumnModule = moduleConfig(
  "geometry",
  "object",
  [FIELDS.floor, FIELDS.marking, FIELDS.projSize1, FIELDS.factSize1, FIELDS.projSize2, FIELDS.factSize2, FIELDS.vertDev],
  [TOLERANCE_LIBRARY.columnSize, TOLERANCE_LIBRARY.columnVerticality],
  [
    withToleranceText(DOCS.sp70Table51, "размеры сечения ±8 мм; вертикальность ±8 мм")
  ],
  [
    {
      key: "column_size_within_tolerance",
      label: "Размеры сечения колонны в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projSize1", "factSize1", "projSize2", "factSize2"],
      toleranceKey: "columnSize",
      normativeDocKeys: [DOCS.sp70Table51.key]
    },
    {
      key: "column_verticality_within_tolerance",
      label: "Отклонение колонны по вертикали в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["vertDev"],
      toleranceKey: "columnVerticality",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: геометрия колонны проверяется по сечению и отклонению от вертикали.",
  verticalColumnBehavior
);

const makeGeometryWallModule = (
  entityLabel: string,
  fieldBehavior: InspectionFieldBehavior
) => moduleConfig(
  "geometry",
  "object",
  [
    FIELDS.floor,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projThick,
    FIELDS.factThick,
    FIELDS.vertDev,
    FIELDS.factWallFlatness,
    FIELDS.projOpeningSizes,
    FIELDS.factOpeningSizes,
    FIELDS.projOpeningHeight,
    FIELDS.factOpeningHeight
  ],
  [
    TOLERANCE_LIBRARY.wallThickness,
    TOLERANCE_LIBRARY.wallVerticality,
    TOLERANCE_LIBRARY.wallFlatness,
    TOLERANCE_LIBRARY.openingSize,
    TOLERANCE_LIBRARY.openingHeight
  ],
  [
    withToleranceText(DOCS.sp70Table51, "толщина ±5 мм; вертикальность ±8 мм; плоскостность ±5 мм; проёмы ±8 мм")
  ],
  [
    {
      key: `${entityLabel.toLocaleLowerCase("ru")}_geometry_within_tolerance`,
      label: `Геометрия конструкции "${entityLabel}" в пределах допуска`,
      kind: "tolerance",
      fieldKeys: ["projThick", "factThick", "vertDev", "factWallFlatness", "projOpeningSizes", "factOpeningSizes"],
      toleranceKey: "wallThickness",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  `Объектовый контроль: геометрия конструкции "${entityLabel}" проверяется по толщине, вертикальности, плоскостности и проёмам.`,
  fieldBehavior
);

const geodesyFloorSlabModule = moduleConfig(
  "geodesy",
  "object",
  [
    FIELDS.floor,
    FIELDS.axesRange,
    FIELDS.projX,
    FIELDS.factX,
    FIELDS.projY,
    FIELDS.factY,
    FIELDS.projH,
    FIELDS.factH,
    FIELDS.geoFlatnessActual,
    FIELDS.geoFlatnessBase,
    FIELDS.geoFlatnessClass,
    FIELDS.geoFlatnessTolerance
  ],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight, TOLERANCE_LIBRARY.plateFlatness],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм; плоскостность по базе измерения"),
    DOCS.sp126
  ],
  [
    ...geodesyFoundationModule.resultRules,
    {
      key: "floor_slab_geo_flatness_within_tolerance",
      label: "Плоскостность плиты перекрытия в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["geoPlateFlatnessActual", "geoPlateFlatnessBase", "geoPlateFlatnessTolerance"],
      toleranceKey: "plateFlatness",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: положение перекрытия проверяется по этажу, осям, координатам, отметке H и плоскостности плиты.",
  horizontalSlabGeodesyBehavior
);

const geometryFloorSlabModule = moduleConfig(
  "geometry",
  "object",
  [
    FIELDS.floor,
    FIELDS.axesRange,
    FIELDS.projHeight,
    FIELDS.factHeight,
    FIELDS.flatness,
    FIELDS.projOpeningSizes,
    FIELDS.factOpeningSizes
  ],
  geometryPlateModule.tolerances,
  geometryPlateModule.normativeDocs,
  geometryPlateModule.resultRules,
  "Объектовый контроль: геометрия перекрытия проверяется по толщине, плоскостности и размерам проёмов.",
  horizontalSlabBehavior
);

const reinforcementFloorSlabModule = moduleConfig(
  "reinforcement",
  "object",
  [FIELDS.floor, FIELDS.axesRange, FIELDS.projDia, FIELDS.factDia, FIELDS.projStep, FIELDS.factStep, FIELDS.projCover, FIELDS.factCover],
  reinforcementPlateModule.tolerances,
  reinforcementPlateModule.normativeDocs,
  reinforcementPlateModule.resultRules,
  "Объектовый контроль: армирование перекрытия проверяется до бетонирования по осям, диаметрам, шагу и защитному слою.",
  horizontalSlabReinforcementBehavior
);

const strengthFloorSlabModule = moduleConfig(
  "strength",
  "object",
  [FIELDS.floor, FIELDS.axesRange, FIELDS.concreteMark, FIELDS.concreteAge, FIELDS.concreteActual],
  strengthConcreteModule.tolerances,
  strengthConcreteModule.normativeDocs,
  strengthConcreteModule.resultRules,
  "Объектовый контроль: прочность бетона перекрытия проверяется по возрасту бетона и фактическим результатам испытаний.",
  horizontalSlabStrengthBehavior
);

const geodesyBeamModule = moduleConfig(
  "geodesy",
  "object",
  [
    FIELDS.floor,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projX,
    FIELDS.factX,
    FIELDS.projY,
    FIELDS.factY
  ],
  [TOLERANCE_LIBRARY.geoPlan],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм"),
    DOCS.sp126
  ],
  [
    {
      key: "beam_geo_position_within_tolerance",
      label: "Положение балки в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["floor", "wallBindingType", "projX", "factX", "projY", "factY"],
      toleranceKey: "geoPlan",
      normativeDocKeys: [DOCS.sp70Table51.key, DOCS.sp126.key]
    }
  ],
  "Объектовый контроль: положение балки проверяется по этажу, осевой привязке и двум точкам координат.",
  horizontalBeamBehavior
);

const geometryBeamModule = moduleConfig(
  "geometry",
  "object",
  [FIELDS.floor, FIELDS.marking, FIELDS.projBeamWidth, FIELDS.factBeamWidth, FIELDS.projBeamHeight, FIELDS.factBeamHeight],
  [TOLERANCE_LIBRARY.beamSize],
  [
    withToleranceText(DOCS.sp70Table51, "размеры сечения балки ±8 мм")
  ],
  [
    {
      key: "beam_section_within_tolerance",
      label: "Размеры сечения балки в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projBeamWidth", "factBeamWidth", "projBeamHeight", "factBeamHeight"],
      toleranceKey: "beamSize",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: геометрия балки проверяется по маркировке и размерам сечения.",
  horizontalBeamBehavior
);

const reinforcementBeamModule = moduleConfig(
  "reinforcement",
  "object",
  [FIELDS.floor, FIELDS.marking, FIELDS.projDia, FIELDS.factDia, FIELDS.projStep, FIELDS.factStep, FIELDS.projCover, FIELDS.factCover],
  reinforcementPlateModule.tolerances,
  reinforcementPlateModule.normativeDocs,
  reinforcementPlateModule.resultRules,
  "Объектовый контроль: армирование балки проверяется до бетонирования по маркировке, диаметрам, шагу и защитному слою.",
  horizontalBeamBehavior
);

const strengthBeamModule = moduleConfig(
  "strength",
  "object",
  [FIELDS.floor, FIELDS.marking, FIELDS.concreteMark, FIELDS.concreteAge, FIELDS.concreteActual],
  strengthConcreteModule.tolerances,
  strengthConcreteModule.normativeDocs,
  strengthConcreteModule.resultRules,
  "Объектовый контроль: прочность бетона балки проверяется по маркировке, возрасту бетона и фактическим результатам испытаний.",
  horizontalBeamBehavior
);

const geodesyElevatorShaftModule = moduleConfig(
  "geodesy",
  "object",
  [
    FIELDS.floor,
    FIELDS.axesRange,
    FIELDS.openingPoints,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projX,
    FIELDS.factX,
    FIELDS.projY,
    FIELDS.factY,
    FIELDS.projH,
    FIELDS.factH
  ],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм"),
    DOCS.sp126
  ],
  [
    {
      key: "elevator_shaft_geo_position_within_tolerance",
      label: "Положение стен шахты лифта в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["floor", "axesRange", "openingPoints", "projX", "factX", "projY", "factY", "projH", "factH"],
      toleranceKey: "geoPlan",
      normativeDocKeys: [DOCS.sp70Table51.key, DOCS.sp126.key]
    }
  ],
  "Объектовый контроль: положение шахты лифта проверяется по этажу, диапазону осей, стенам шахты, отметкам и характерным точкам проёма.",
  elevatorShaftBehavior
);

const reinforcementElevatorShaftModule = moduleConfig(
  "reinforcement",
  "object",
  [
    FIELDS.floor,
    FIELDS.axesRange,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projDia,
    FIELDS.factDia,
    FIELDS.projStep,
    FIELDS.factStep,
    FIELDS.projCover,
    FIELDS.factCover
  ],
  reinforcementPlateModule.tolerances,
  reinforcementPlateModule.normativeDocs,
  reinforcementPlateModule.resultRules,
  "Объектовый контроль: армирование стен шахты лифта проверяется до бетонирования по осям, диаметрам, шагу и защитному слою.",
  elevatorShaftBehavior
);

const geometryElevatorShaftWallBasis = makeGeometryWallModule("Шахта лифта", elevatorShaftBehavior);

const geometryElevatorShaftModule = moduleConfig(
  "geometry",
  "object",
  [
    FIELDS.floor,
    FIELDS.axesRange,
    FIELDS.wallBindingType,
    FIELDS.wallLetterAxis,
    FIELDS.wallNumberAxis1,
    FIELDS.wallNumberAxis2,
    FIELDS.wallNumberAxis,
    FIELDS.wallLetterAxis1,
    FIELDS.wallLetterAxis2,
    FIELDS.projThick,
    FIELDS.factThick,
    FIELDS.vertDev,
    FIELDS.factWallFlatness,
    FIELDS.projOpeningSizes,
    FIELDS.factOpeningSizes,
    FIELDS.projOpeningHeight,
    FIELDS.factOpeningHeight
  ],
  geometryElevatorShaftWallBasis.tolerances,
  geometryElevatorShaftWallBasis.normativeDocs,
  geometryElevatorShaftWallBasis.resultRules,
  "Объектовый контроль: геометрия стен шахты лифта проверяется по толщине, вертикальности, плоскостности и проёмам.",
  elevatorShaftBehavior
);

const strengthElevatorShaftModule = moduleConfig(
  "strength",
  "object",
  [FIELDS.floor, FIELDS.axesRange, FIELDS.concreteMark, FIELDS.concreteAge, FIELDS.concreteActual],
  strengthConcreteModule.tolerances,
  strengthConcreteModule.normativeDocs,
  strengthConcreteModule.resultRules,
  "Объектовый контроль: прочность бетона шахты лифта проверяется по этажу, осям, возрасту бетона и фактическим результатам испытаний.",
  elevatorShaftBehavior
);

const geodesyStairCoreModule = moduleConfig(
  "geodesy",
  "object",
  [FIELDS.floor, FIELDS.stairName, FIELDS.axesRange, FIELDS.projX, FIELDS.factX, FIELDS.projY, FIELDS.factY, FIELDS.projH, FIELDS.factH],
  [TOLERANCE_LIBRARY.geoPlan, TOLERANCE_LIBRARY.geoHeight],
  [
    withToleranceText(DOCS.sp70Table51, "допуск X/Y ±8 мм, H ±10 мм"),
    DOCS.sp126
  ],
  [
    {
      key: "stair_core_geo_position_within_tolerance",
      label: "Положение лестничной клетки в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["floor", "stairName", "axesRange", "projX", "factX", "projY", "factY", "projH", "factH"],
      toleranceKey: "geoPlan",
      normativeDocKeys: [DOCS.sp70Table51.key, DOCS.sp126.key]
    }
  ],
  "Объектовый контроль: положение лестничной клетки проверяется по этажу, наименованию лестницы, диапазону осей, координатам и отметке.",
  stairCoreBehavior
);

const reinforcementStairCoreModule = moduleConfig(
  "reinforcement",
  "object",
  [FIELDS.floor, FIELDS.stairName, FIELDS.axesRange, FIELDS.projDia, FIELDS.factDia, FIELDS.projStep, FIELDS.factStep, FIELDS.projCover, FIELDS.factCover],
  reinforcementPlateModule.tolerances,
  reinforcementPlateModule.normativeDocs,
  reinforcementPlateModule.resultRules,
  "Объектовый контроль: армирование лестничной клетки проверяется до бетонирования по этажу, осям, диаметрам, шагу и защитному слою.",
  stairCoreBehavior
);

const geometryStairCoreModule = moduleConfig(
  "geometry",
  "object",
  [
    FIELDS.floor,
    FIELDS.stairName,
    FIELDS.axesRange,
    FIELDS.projStepHeight,
    FIELDS.factStepHeight,
    FIELDS.projStepWidth,
    FIELDS.factStepWidth,
    FIELDS.projFlightWidth,
    FIELDS.factFlightWidth
  ],
  [TOLERANCE_LIBRARY.stairStepHeight, TOLERANCE_LIBRARY.stairStepWidth],
  [
    withToleranceText(DOCS.sp70Table51, "высота ступени ±5 мм; ширина проступи/марша ±5 мм")
  ],
  [
    {
      key: "stair_core_step_height_within_tolerance",
      label: "Высота ступени в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projStepHeight", "factStepHeight"],
      toleranceKey: "stairStepHeight",
      normativeDocKeys: [DOCS.sp70Table51.key]
    },
    {
      key: "stair_core_step_width_within_tolerance",
      label: "Ширина проступи и марша в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projStepWidth", "factStepWidth", "projFlightWidth", "factFlightWidth"],
      toleranceKey: "stairStepWidth",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: геометрия лестничной клетки проверяется по высоте ступени, ширине проступи и ширине марша.",
  stairCoreBehavior
);

const strengthStairCoreModule = moduleConfig(
  "strength",
  "object",
  [FIELDS.floor, FIELDS.stairName, FIELDS.axesRange, FIELDS.concreteMark, FIELDS.concreteAge, FIELDS.concreteActual],
  strengthConcreteModule.tolerances,
  strengthConcreteModule.normativeDocs,
  strengthConcreteModule.resultRules,
  "Объектовый контроль: прочность бетона лестничной клетки проверяется по возрасту бетона и фактическим результатам испытаний.",
  stairCoreBehavior
);

const stripGeometryModule = moduleConfig(
  "geometry",
  "object",
  [FIELDS.axesRange, FIELDS.projHeight, FIELDS.factHeight, FIELDS.projOpeningSizes, FIELDS.factOpeningSizes],
  [TOLERANCE_LIBRARY.plateHeight, TOLERANCE_LIBRARY.openingSize],
  [
    withToleranceText(DOCS.sp70Table51, "высота/ширина ±5-8 мм по проекту и таблице допусков")
  ],
  [
    {
      key: "strip_height_width_within_tolerance",
      label: "Высота и ширина ленты в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projPlateHeight", "factPlateHeight", "projOpeningSizes", "factOpeningSizes"],
      toleranceKey: "plateHeight",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: геометрия ленточного фундамента проверяется по осям, высоте и ширине ленты.",
  stripGeometryBehavior
);

const stripReinforcementModule = moduleConfig(
  "reinforcement",
  "object",
  [
    FIELDS.axesRange,
    FIELDS.projDia,
    FIELDS.factDia,
    FIELDS.projStep,
    FIELDS.factStep,
    FIELDS.projCover,
    FIELDS.factCover,
    FIELDS.projHoopsStep,
    FIELDS.factHoopsStep
  ],
  [
    TOLERANCE_LIBRARY.rebarDiameter,
    TOLERANCE_LIBRARY.rebarStep,
    TOLERANCE_LIBRARY.rebarCover,
    TOLERANCE_LIBRARY.hoopsStep
  ],
  [
    withToleranceText(DOCS.gostRebar, "диаметр строго; шаг/хомуты ±20 мм"),
    withToleranceText(DOCS.sp70Table51, "защитный слой ±5 мм")
  ],
  [
    ...reinforcementPlateModule.resultRules,
    {
      key: "strip_hoops_step_within_tolerance",
      label: "Шаг хомутов в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["projHoopsStep", "factHoopsStep"],
      toleranceKey: "hoopsStep",
      normativeDocKeys: [DOCS.gostRebar.key]
    }
  ],
  "Объектовый контроль: армирование ленты проверяется до бетонирования, включая хомуты и защитный слой.",
  stripReinforcementBehavior
);

const pileGeometryModule = moduleConfig(
  "geometry",
  "object",
  [FIELDS.pileElement, FIELDS.projHeight, FIELDS.factHeight, FIELDS.projOpeningSizes, FIELDS.factOpeningSizes],
  [TOLERANCE_LIBRARY.plateHeight, TOLERANCE_LIBRARY.openingSize],
  [
    withToleranceText(DOCS.sp70Table51, "геометрия буронабивной сваи / ростверка по проекту и допускам")
  ],
  [
    {
      key: "pile_or_grillage_geometry_within_tolerance",
      label: "Геометрия сваи или ростверка в пределах допуска",
      kind: "tolerance",
      fieldKeys: ["constructionPileElement", "projPlateHeight", "factPlateHeight", "projOpeningSizes", "factOpeningSizes"],
      toleranceKey: "plateHeight",
      normativeDocKeys: [DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: для буронабивных свай и ростверка геометрия проверяется на площадке; для заводских свай применяется заводской контроль.",
  pileObjectBehavior
);

const pileReinforcementModule = moduleConfig(
  "reinforcement",
  "object",
  [FIELDS.pileElement, FIELDS.projDia, FIELDS.factDia, FIELDS.projStep, FIELDS.factStep, FIELDS.projCover, FIELDS.factCover],
  [TOLERANCE_LIBRARY.rebarDiameter, TOLERANCE_LIBRARY.rebarStep, TOLERANCE_LIBRARY.rebarCover],
  reinforcementPlateModule.normativeDocs,
  reinforcementPlateModule.resultRules,
  "Объектовый контроль: армирование буронабивных свай и ростверка проверяется до бетонирования; заводские сваи идут по заводскому контролю.",
  pileObjectBehavior
);

const formworkGeometryModule = moduleConfig(
  "geometry",
  "object",
  [
    FIELDS.formworkType,
    FIELDS.formworkFloor,
    FIELDS.formworkElementName,
    FIELDS.formworkArea,
    FIELDS.formworkProjHeight,
    FIELDS.formworkFactHeight,
    FIELDS.formworkProjWidth,
    FIELDS.formworkFactWidth,
    FIELDS.formworkProjThickness,
    FIELDS.formworkFactThickness,
    FIELDS.formworkVerticalDeviation,
    FIELDS.formworkVerticalTolerance,
    FIELDS.formworkBasis,
    FIELDS.formworkResult,
    FIELDS.note
  ],
  [TOLERANCE_LIBRARY.formworkManual],
  [DOCS.sp371, DOCS.gost34329, withToleranceText(DOCS.sp70Table51, "отклонения принимаются по проекту/ППР и применимым нормам")],
  [
    {
      key: "formwork_manual_tolerances",
      label: "Отклонение от вертикали опалубки не превышает заданный допуск",
      kind: "manual",
      fieldKeys: ["formworkVerticalDeviation", "formworkVerticalTolerance"],
      toleranceKey: "formworkManual",
      normativeDocKeys: [DOCS.sp371.key, DOCS.gost34329.key, DOCS.sp70Table51.key]
    }
  ],
  "Объектовый контроль: для опалубки применяется модуль геометрии; геодезия, армирование и прочность бетона не выполняются.",
  formworkGeometryBehavior
);

const formworkNotApplicableMessage =
  "Для опалубки данный модуль не применяется. Контроль выполняется в модуле «Геометрия».";

const notApplicableModule = (
  module: InspectionModule,
  infoMessage: string
) => moduleConfig(module, "notApplicable", [], [], [], [], infoMessage);

const factoryModule = (
  module: InspectionModule,
  infoMessage: string
) => moduleConfig(module, "factory", [], [], [], [], infoMessage);

export const INSPECTION_REGISTRY = Object.freeze({
  foundation_slab: Object.freeze({
    category: "foundation",
    construction: "foundation_slab",
    modules: Object.freeze({
      geodesy: geodesyFoundationModule,
      reinforcement: reinforcementPlateModule,
      geometry: geometryPlateModule,
      strength: strengthConcreteModule
    })
  }),
  strip_foundation: Object.freeze({
    category: "foundation",
    construction: "strip_foundation",
    modules: Object.freeze({
      geodesy: geodesyStripFoundationModule,
      reinforcement: stripReinforcementModule,
      geometry: stripGeometryModule,
      strength: strengthConcreteModule
    })
  }),
  pile_grillage: Object.freeze({
    category: "foundation",
    construction: "pile_grillage",
    subtype: "bored_piles",
    modules: Object.freeze({
      geodesy: geodesyFoundationModule,
      reinforcement: pileReinforcementModule,
      geometry: pileGeometryModule,
      strength: strengthConcreteModule
    }),
    subtypeOverrides: Object.freeze({
      precast_rc_piles: Object.freeze({
        reinforcement: factoryModule("reinforcement", factoryPileRebarMessage),
        geometry: factoryModule("geometry", factoryPileGeometryMessage)
      }),
      screw_piles: Object.freeze({
        reinforcement: factoryModule("reinforcement", factoryPileRebarMessage),
        geometry: factoryModule("geometry", factoryPileGeometryMessage)
      }),
      bored_piles: Object.freeze({
        reinforcement: pileReinforcementModule,
        geometry: pileGeometryModule
      })
    })
  }),
  wall: Object.freeze({
    category: "vertical_load_bearing",
    construction: "wall",
    modules: Object.freeze({
      geodesy: makeGeodesyWallModule("Стена", "Стены", verticalWallBehavior),
      reinforcement: makeReinforcementWallModule("Стена", verticalWallBehavior),
      geometry: makeGeometryWallModule("Стена", verticalWallBehavior),
      strength: makeVerticalStrengthModule("Стена", verticalWallBehavior)
    })
  }),
  column: Object.freeze({
    category: "vertical_load_bearing",
    construction: "column",
    modules: Object.freeze({
      geodesy: geodesyColumnModule,
      reinforcement: reinforcementColumnModule,
      geometry: geometryColumnModule,
      strength: makeVerticalStrengthModule("Колонна", verticalColumnBehavior)
    })
  }),
  pylon: Object.freeze({
    category: "vertical_load_bearing",
    construction: "pylon",
    modules: Object.freeze({
      geodesy: makeGeodesyWallModule("Пилон", "Пилоны", verticalPylonBehavior),
      reinforcement: makeReinforcementWallModule("Пилон", verticalPylonBehavior),
      geometry: makeGeometryWallModule("Пилон", verticalPylonBehavior),
      strength: makeVerticalStrengthModule("Пилон", verticalPylonBehavior)
    })
  }),
  floor_slab: Object.freeze({
    category: "horizontal_load_bearing",
    construction: "floor_slab",
    modules: Object.freeze({
      geodesy: geodesyFloorSlabModule,
      reinforcement: reinforcementFloorSlabModule,
      geometry: geometryFloorSlabModule,
      strength: strengthFloorSlabModule
    })
  }),
  beam: Object.freeze({
    category: "horizontal_load_bearing",
    construction: "beam",
    modules: Object.freeze({
      geodesy: geodesyBeamModule,
      reinforcement: reinforcementBeamModule,
      geometry: geometryBeamModule,
      strength: strengthBeamModule
    })
  }),
  elevator_shaft: Object.freeze({
    category: "stiffness_cores",
    construction: "elevator_shaft",
    modules: Object.freeze({
      geodesy: geodesyElevatorShaftModule,
      reinforcement: reinforcementElevatorShaftModule,
      geometry: geometryElevatorShaftModule,
      strength: strengthElevatorShaftModule
    })
  }),
  stair_core: Object.freeze({
    category: "stiffness_cores",
    construction: "stair_core",
    modules: Object.freeze({
      geodesy: geodesyStairCoreModule,
      reinforcement: reinforcementStairCoreModule,
      geometry: geometryStairCoreModule,
      strength: strengthStairCoreModule
    })
  }),
  formwork: Object.freeze({
    category: "formwork",
    construction: "formwork",
    subtype: "temporary",
    modules: Object.freeze({
      geodesy: notApplicableModule("geodesy", formworkNotApplicableMessage),
      reinforcement: notApplicableModule("reinforcement", formworkNotApplicableMessage),
      geometry: formworkGeometryModule,
      strength: notApplicableModule("strength", formworkNotApplicableMessage)
    }),
    subtypeOverrides: Object.freeze({
      temporary: Object.freeze({
        geometry: formworkGeometryModule
      }),
      permanent: Object.freeze({
        geometry: formworkGeometryModule
      })
    })
  })
} as const satisfies Readonly<Record<string, ConstructionInspectionConfig>>);

export const InspectionRegistry = INSPECTION_REGISTRY;
export const constructionMatrix = INSPECTION_REGISTRY;
export const inspectionConfig = INSPECTION_REGISTRY;

function normalizeRegistryKey(value: unknown) {
  return String(value ?? "").trim();
}

export function toInspectionModule(module: ModuleInput): InspectionModule {
  return module === "geo" ? "geodesy" : module;
}

export function getInspectionStatusLabel(status: InspectionStatus | null | undefined, fallback = "") {
  return status ? INSPECTION_STATUS_LABELS[status] || fallback : fallback;
}

function mergeModuleConfig(
  baseConfig: ConstructionInspectionModuleConfig,
  overrideConfig?: Partial<ConstructionInspectionModuleConfig>
): ConstructionInspectionModuleConfig {
  if (!overrideConfig) return baseConfig;

  return Object.freeze({
    ...baseConfig,
    ...overrideConfig,
    module: overrideConfig.module || baseConfig.module,
    fields: Object.freeze([...(overrideConfig.fields || baseConfig.fields)]),
    tolerances: Object.freeze([...(overrideConfig.tolerances || baseConfig.tolerances)]),
    normativeDocs: Object.freeze([...(overrideConfig.normativeDocs || baseConfig.normativeDocs)]),
    resultRules: Object.freeze([...(overrideConfig.resultRules || baseConfig.resultRules)]),
    fieldBehavior: Object.freeze({
      ...(baseConfig.fieldBehavior || {}),
      ...(overrideConfig.fieldBehavior || {})
    })
  });
}

export function getConstructionInspectionConfig(constructionValue: unknown) {
  const key = normalizeRegistryKey(constructionValue);
  return key ? INSPECTION_REGISTRY[key] || null : null;
}

export function getConstructionModuleInspectionConfig(
  constructionValue: unknown,
  module: ModuleInput,
  subtypeValue = ""
) {
  const config = getConstructionInspectionConfig(constructionValue);
  if (!config) return null;

  const inspectionModule = toInspectionModule(module);
  const baseModuleConfig = config.modules[inspectionModule];
  if (!baseModuleConfig) return null;

  const subtypeKey = normalizeRegistryKey(subtypeValue || config.subtype || "");
  const subtypeOverride = subtypeKey ? config.subtypeOverrides?.[subtypeKey]?.[inspectionModule] : null;
  return mergeModuleConfig(baseModuleConfig, subtypeOverride || undefined);
}

export function getInspectionConfig(
  constructionValue: unknown,
  module?: ModuleInput,
  subtypeValue = ""
) {
  return module
    ? getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue)
    : getConstructionInspectionConfig(constructionValue);
}

export function getInspectionFields(
  constructionValue: unknown,
  module: ModuleInput,
  subtypeValue = ""
) {
  return getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue)?.fields || [];
}

export function hasInspectionField(
  constructionValue: unknown,
  module: ModuleInput,
  fieldKey: string,
  subtypeValue = ""
) {
  return getInspectionFields(constructionValue, module, subtypeValue).some((field) => field.key === fieldKey);
}

export function getInspectionModuleStatus(
  constructionValue: unknown,
  module: ModuleInput,
  subtypeValue = ""
) {
  return getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue)?.status || null;
}

export const getInspectionStatus = getInspectionModuleStatus;

export function getInspectionInfoMessage(
  constructionValue: unknown,
  module: ModuleInput,
  subtypeValue = ""
) {
  return getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue)?.infoMessage || "";
}

export function getInspectionFieldBehavior(
  constructionValue: unknown,
  module: ModuleInput,
  subtypeValue = ""
) {
  return getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue)?.fieldBehavior || null;
}

export function getInspectionNormativeDocs(
  constructionValue: unknown,
  module: ModuleInput,
  subtypeValue = ""
) {
  return getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue)?.normativeDocs || [];
}

export function getInspectionTolerance(
  constructionValue: unknown,
  module: ModuleInput,
  toleranceKey: string,
  subtypeValue = ""
) {
  const moduleConfig = getConstructionModuleInspectionConfig(constructionValue, module, subtypeValue);
  return moduleConfig?.tolerances.find((tolerance) => tolerance.key === toleranceKey) || null;
}

export function getInspectionToleranceValue(
  constructionValue: unknown,
  module: ModuleInput,
  toleranceKey: string,
  fallback: number | null = null,
  subtypeValue = ""
) {
  const tolerance = getInspectionTolerance(constructionValue, module, toleranceKey, subtypeValue);
  return typeof tolerance?.value === "number" ? tolerance.value : fallback;
}
