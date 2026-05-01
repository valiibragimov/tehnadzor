/**
 * Модуль для формирования итогового заключения
 * Использует данные журнала как единственный источник информации
 */

import { 
  getModuleStats, 
  formatJournalTimestamp
} from "./journal.js";

// ============================
// Константы
// ============================
const MODULE_NAMES = {
  geo: "Геодезия",
  reinforcement: "Армирование",
  geometry: "Геометрия",
  strength: "Прочность"
};

// ============================
// Получение статистики модулей
// ============================

/**
 * Получает статистику модуля из журнала
 * @param {Array} journalEntries - Массив записей журнала
 * @param {string} moduleKey - Ключ модуля (geo, reinforcement, geometry, strength)
 * @param {string} construction - Конструкция для фильтрации
 * @returns {Object} Статистика: { status, total, exceeded, lastCheck }
 */
export function getModuleStatusFromJournal(journalEntries, moduleKey, construction) {
  const moduleName = MODULE_NAMES[moduleKey];
  if (!moduleName) {
    console.warn(`[Summary] Неизвестный модуль: ${moduleKey}`);
    return { status: "empty", total: 0, exceeded: 0, lastCheck: null };
  }

  const stats = getModuleStats(journalEntries, moduleName, construction);

  let status;
  if (stats.total === 0) {
    status = "empty";
  } else if (stats.exceeded > 0) {
    status = "exceeded";
  } else {
    status = "ok";
  }

  return {
    status,
    total: stats.total,
    exceeded: stats.exceeded,
    lastCheck: stats.lastCheck
  };
}

/**
 * Получает статистику всех модулей из журнала
 * @param {Array} journalEntries - Массив записей журнала
 * @param {string} construction - Конструкция для фильтрации
 * @returns {Object} Статистика всех модулей
 */
export function getAllModulesStatusFromJournal(journalEntries, construction) {
  return {
    geo: getModuleStatusFromJournal(journalEntries, "geo", construction),
    reinforcement: getModuleStatusFromJournal(journalEntries, "reinforcement", construction),
    geometry: getModuleStatusFromJournal(journalEntries, "geometry", construction),
    strength: getModuleStatusFromJournal(journalEntries, "strength", construction)
  };
}

// ============================
// Форматирование для UI
// ============================

/**
 * Форматирует статус для отображения
 * @param {string} status - Статус (ok, exceeded, empty)
 * @returns {string} Текст статуса
 */
export function formatStatus(status) {
  switch (status) {
    case "ok":
      return "В НОРМЕ";
    case "exceeded":
      return "ПРЕВЫШЕНО";
    case "empty":
    default:
      return "нет данных";
  }
}

/**
 * Форматирует дату последней проверки
 * @param {Timestamp|number|null} timestamp - Временная метка
 * @returns {string} Отформатированная дата или "—"
 */
export function formatLastCheckDate(timestamp) {
  if (!timestamp) {
    return "—";
  }
  return formatJournalTimestamp(timestamp);
}
