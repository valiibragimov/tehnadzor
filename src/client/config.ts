/**
 * Конфигурация приложения
 * Содержит все константы, допуски и настройки
 */

// ============================
// Допуски для геодезической привязки
// ============================
export const TOLERANCES = {
  // Геодезическая привязка
  PLAN_XY: 8,    // Допуск координат X/Y: ±8 мм (СП 70.13330.2012)
  HEIGHT: 10,    // Допуск высоты H: ±10 мм (СП 70.13330.2012)
  
  // Армирование
  DIAMETER: 0,   // Диаметр арматуры: строгое соответствие проекту (ГОСТ Р 57997-2017)
  STEP: 20,      // Базовый допуск шага: ±20 мм (контроль по проекту и действующим нормам)
  COVER: 5,      // Допуск защитного слоя: ±5 мм (СП 70.13330.2012, табл. 5.1)
  HOOPS_STEP: 20, // Базовый допуск шага хомутов: ±20 мм (контроль по проекту и действующим нормам)
  
  // Геометрия
  PLATE_HEIGHT: 5,      // Допуск толщины плиты: ±5 мм (ГОСТ 9561-2016)
  PLATE_FLATNESS: 5,    // Допуск плоскостности плиты: ±5 мм (СП 70.13330.2012)
  COLUMN_SIZE: 8,       // Допуск размеров колонны: ±8 мм (СП 70.13330.2012)
  COLUMN_VERT: 8,       // Допуск вертикальности колонны: ±8 мм (СП 70.13330.2012)
  WALL_THICK: 5,        // Допуск толщины стены: ±5 мм (СП 70.13330.2012)
  WALL_VERT: 8,         // Допуск вертикальности стены: ±8 мм (СП 70.13330.2012)
  WALL_FLATNESS: 5,     // Допуск плоскостности стены: ±5 мм (СП 70.13330.2012)
  OPENING_SIZE: 8,      // Базовый допуск линейных размеров проёмов: ±8 мм (СП 70.13330.2012)
  OPENING_HEIGHT: 8,    // Базовый допуск отметки расположения проёмов: ±8 мм (СП 70.13330.2012)
  BEAM_SIZE: 8,         // Допуск размеров балки: ±8 мм (СП 70.13330.2012)
  STAIR_STEP_HEIGHT: 5, // Допуск высоты ступени: ±5 мм (СП 70.13330.2012)
  STAIR_STEP_WIDTH: 5,  // Допуск ширины ступени: ±5 мм (СП 70.13330.2012)
};

// ============================
// Нормативные документы
// ============================
// Все ссылки ведут на актуальные документы на docs.cntd.ru
export const REGULATORY_DOCS = {
  // СП 70.13330.2012 "Несущие и ограждающие конструкции" (с изм. 1, 3-7)
  SP_70_13330_2012: "https://docs.cntd.ru/document/1200097510",
  // СП 126.13330.2017 "Геодезические работы в строительстве" (с изм. 1, 2)
  SP_126_13330_2017: "https://docs.cntd.ru/document/550965720",
  // ГОСТ Р 58945-2020 "Система обеспечения точности геометрических параметров... Параметры зданий и сооружений"
  GOST_R_58945_2020: "https://docs.cntd.ru/document/1200174486",
  // ГОСТ Р 58941-2020 "Система обеспечения точности геометрических параметров... Общие положения"
  GOST_R_58941_2020: "https://docs.cntd.ru/document/1200174482",
  // ГОСТ Р 57997-2017 "Арматурные и закладные изделия, сварные, вязаные и механические соединения..."
  GOST_R_57997_2017: "https://docs.cntd.ru/document/1200157630",
  // Приказ Росстандарта о введении ГОСТ Р 57997-2017
  ORDER_ROSSTANDARD_1857_ST: "https://docs.cntd.ru/document/555961396",
  // ГОСТ 9561-2016 "Плиты перекрытий железобетонные..."
  GOST_9561_2016: "https://docs.cntd.ru/document/1200141739",
  // ГОСТ 18105-2018 "Бетоны. Правила контроля и оценки прочности" (с Поправками)
  GOST_18105_2018: "https://docs.cntd.ru/document/1200164028",
  // СП 122.13330.2023 "Тоннели железнодорожные и автодорожные" (с изм. 1)
  SP_122_13330_2023: "https://docs.cntd.ru/document/1304138944?marker=7D20K3",

  // Legacy aliases for backward compatibility.
  GOST_10922_2012: "https://docs.cntd.ru/document/1200157630",
  GOST_26433_1_89: "https://docs.cntd.ru/document/1200174486",
  GOST_9561_2025: "https://docs.cntd.ru/document/1200141739"
};

// ============================
// Настройки приложения
// ============================
const runtimeAppConfig =
  typeof globalThis !== "undefined" &&
  globalThis.__APP_CONFIG__ &&
  typeof globalThis.__APP_CONFIG__ === "object"
    ? globalThis.__APP_CONFIG__
    : {};

function readRuntimeConfigString(key, fallback = "") {
  const runtimeValue = runtimeAppConfig[key];
  if (typeof runtimeValue !== "string") return fallback;
  return runtimeValue.trim() || fallback;
}

export const APP_CONFIG = {
  MAX_ELEMENTS: 20,  // Максимальное количество элементов (колонн, стен, балок) на одну проверку
  DEFAULT_CONSTRUCTION: "floor_slab",
  DEFAULT_LETTER_AXIS: "А",
  DEFAULT_NUMBER_AXIS: "1",
  // Для hosted-версии эти URL можно задавать через window.__APP_CONFIG__ до загрузки app.js:
  // window.__APP_CONFIG__ = { BIM_IMPORT_API_BASE: "https://bim.example.com" }
  AI_REPORT_API_BASE: readRuntimeConfigString("AI_REPORT_API_BASE", ""),
  BIM_IMPORT_API_BASE: readRuntimeConfigString(
    "BIM_IMPORT_API_BASE",
    readRuntimeConfigString("AI_REPORT_API_BASE", "")
  ),
  AI_REPORT_SERVICE_NAME: "TechNadzor AI",
};

export const UI_TEXT = {
  PLATE_FLATNESS_HELP:
    "Проверьте плиту двухметровой рейкой и возьмите максимальный зазор между рейкой и поверхностью."
};

// ============================
// Ключи localStorage
// ============================
export const STORAGE_KEYS = {
  NODES: "geo_nodes_v1",
  META: "app_meta_v1",
  TAB: "active_tab_v1",
  JOURNAL: "journal_v1",
  REINF: "reinf_checks_v1",
  GEOM: "geom_checks_v1",
  STRENGTH: "strength_checks_v1",
};

// ============================
// Типы конструкций
// ============================
export const CONSTRUCTION_TYPES = {
  PLATE: "Плита",
  COLUMN: "Колонна",
  WALL: "Стена",
  STAIR: "Лестница",
  BEAM: "Балка",
};

// ============================
// Статусы данных
// ============================
export const DATA_STATUS = {
  EMPTY: "empty",
  PROJECT_ONLY: "project_only",
  FACT_ONLY: "fact_only",
  BOTH: "both",
  CHECKED: "checked",
};

// ============================
// Буквенные оси для строительных чертежей
// ============================
/**
 * Допустимые буквы для обозначения осей в строительных чертежах.
 * Исключены буквы, которые могут путаться с цифрами или друг с другом:
 * - Ё (похожа на Е)
 * - Й (похожа на И)
 * - О (похожа на 0)
 * - З (похожа на 3)
 * - Ч (похожа на 4 в некоторых шрифтах)
 * - Ъ, Ы, Ь (не используются в обозначениях осей)
 */
export const VALID_LETTER_AXES = [
  "А", "Б", "В", "Г", "Д", "Е", "Ж", "И", "К", "Л", "М", "Н",
  "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ш", "Щ", "Э", "Ю", "Я"
];

// ============================
// Классы прочности бетона (ГОСТ 26633-2015)
// ============================
/**
 * Табличные значения классов прочности бетона по ГОСТ 26633-2015.
 * Каждый класс содержит обозначение класса и соответствующее значение в МПа.
 */
export const CONCRETE_STRENGTH_CLASSES = [
  { class: "B7.5", mpa: 7.5, mark: "М100" },
  { class: "B10", mpa: 10, mark: "М150" },
  { class: "B12.5", mpa: 12.5, mark: "М150" },
  { class: "B15", mpa: 15, mark: "М200" },
  { class: "B20", mpa: 20, mark: "М250" },
  { class: "B22.5", mpa: 22.5, mark: "М300" },
  { class: "B25", mpa: 25, mark: "М350" },
  { class: "B27.5", mpa: 27.5, mark: "М350" },
  { class: "B30", mpa: 30, mark: "М400" },
  { class: "B35", mpa: 35, mark: "М450" },
  { class: "B40", mpa: 40, mark: "М500" },
  { class: "B45", mpa: 45, mark: "М550" },
  { class: "B50", mpa: 50, mark: "М600" },
  { class: "B55", mpa: 55, mark: "М700" },
  { class: "B60", mpa: 60, mark: "М800" },
  { class: "B70", mpa: 70, mark: "М900" },
  { class: "B80", mpa: 80, mark: "М1000" },
];
