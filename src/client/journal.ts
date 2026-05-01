/**
 * Модуль для работы с журналом проверок
 * Журнал является единым источником данных для итогового заключения
 * Все записи хранятся в Firestore
 */

import {
  addJournalEntryDoc,
  addJournalEntryDocs,
  clearJournalEntriesByProject,
  deleteJournalEntryDoc,
  getJournalEntriesFilteredSnapshot,
  getJournalEntriesSnapshot
} from "./app/repositories/firestore-repository.js";
import { Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============================
// Константы
// ============================
const JOURNAL_COLLECTION = "journal";

// ============================
// Структура записи журнала
// ============================
/**
 * Создает запись журнала
 * @param {Object} params - Параметры записи
 * @param {string} params.projectId - ID проекта
 * @param {string} params.module - Модуль (Геодезия, Армирование, Геометрия, Прочность)
 * @param {string} params.construction - Конструкция (Плита, Колонна, Стена, Лестница, Балка)
 * @param {string} params.context - Контекст (узел, стена, плита, номер проверки)
 * @param {string} params.status - Статус ("ok" или "exceeded")
 * @param {number} params.exceededCount - Количество превышений
 * @param {string} params.details - Подробности проверки
 * @param {string} params.sourceId - ID исходной проверки в модуле (опционально)
 * @returns {Object} Запись журнала
 */
export function createJournalEntry({
  projectId,
  module,
  construction,
  constructionCategory = null,
  constructionLabel = null,
  constructionSubtype = null,
  constructionSubtypeLabel = null,
  context = "",
  status,
  exceededCount = 0,
  details = "",
  sourceId = null
}) {
  if (!projectId) {
    throw new Error("projectId обязателен для создания записи журнала");
  }
  if (!module) {
    throw new Error("module обязателен для создания записи журнала");
  }
  if (!construction) {
    throw new Error("construction обязателен для создания записи журнала");
  }
  if (status !== "ok" && status !== "exceeded") {
    throw new Error("status должен быть 'ok' или 'exceeded'");
  }

  return {
    projectId,
    module,
    construction,
    constructionCategory,
    constructionLabel,
    constructionSubtype,
    constructionSubtypeLabel,
    context: context || "",
    status,
    exceededCount: exceededCount || 0,
    timestamp: Timestamp.now(),
    details: details || "",
    sourceId: sourceId || null
  };
}

// ============================
// Сохранение записей
// ============================

/**
 * Добавляет запись в журнал в Firestore
 * @param {Object} entry - Запись журнала
 * @returns {Promise<string>} ID созданной записи
 */
export async function addJournalEntry(entry) {
  try {
    const created = await addJournalEntryDoc(entry);
    console.log("[Journal] Запись добавлена в журнал:", created.id);
    return created.id;
  } catch (error) {
    console.error("[Journal] Ошибка добавления записи в журнал:", error);
    throw error;
  }
}

/**
 * Добавляет несколько записей в журнал (batch)
 * @param {Array<Object>} entries - Массив записей журнала
 * @returns {Promise<void>}
 */
export async function addJournalEntries(entries) {
  if (!entries || entries.length === 0) {
    return;
  }

  try {
    await addJournalEntryDocs(entries);
    console.log(`[Journal] Добавлено ${entries.length} записей в журнал`);
  } catch (error) {
    console.error("[Journal] Ошибка добавления записей в журнал:", error);
    throw error;
  }
}

// ============================
// Загрузка записей
// ============================

/**
 * Загружает все записи журнала для проекта
 * @param {string} projectId - ID проекта
 * @returns {Promise<Array>} Массив записей журнала
 */
export async function loadJournalEntries(projectId) {
  if (!projectId) {
    console.warn("[Journal] projectId не указан, возвращаем пустой массив");
    return [];
  }

  try {
    const querySnapshot = await getJournalEntriesSnapshot(projectId);
    const entries = [];

    querySnapshot.forEach((doc) => {
      entries.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`[Journal] Загружено ${entries.length} записей для проекта ${projectId}`);
    return entries;
  } catch (error) {
    console.error("[Journal] Ошибка загрузки записей журнала:", error);
    return [];
  }
}

/**
 * Загружает записи журнала с фильтрацией
 * @param {string} projectId - ID проекта
 * @param {Object} filters - Фильтры
 * @param {string} filters.module - Фильтр по модулю
 * @param {string} filters.construction - Фильтр по конструкции
 * @returns {Promise<Array>} Массив отфильтрованных записей
 */
export async function loadJournalEntriesFiltered(projectId, filters = {}) {
  if (!projectId) {
    return [];
  }

  try {
    const querySnapshot = await getJournalEntriesFilteredSnapshot(projectId, filters);
    const entries = [];

    querySnapshot.forEach((doc) => {
      entries.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return entries;
  } catch (error) {
    console.error("[Journal] Ошибка загрузки отфильтрованных записей:", error);
    return [];
  }
}

// ============================
// Удаление записей
// ============================

/**
 * Удаляет запись из журнала
 * @param {string} entryId - ID записи
 * @returns {Promise<void>}
 */
export async function deleteJournalEntry(entryId) {
  try {
    await deleteJournalEntryDoc(entryId);
    console.log("[Journal] Запись удалена:", entryId);
  } catch (error) {
    console.error("[Journal] Ошибка удаления записи:", error);
    throw error;
  }
}

/**
 * Удаляет все записи журнала для проекта
 * @param {string} projectId - ID проекта
 * @returns {Promise<number>} Количество удаленных записей
 */
export async function clearJournal(projectId) {
  if (!projectId) {
    console.warn("[Journal] projectId не указан, очистка невозможна");
    return 0;
  }

  try {
    const deletedCount = await clearJournalEntriesByProject(projectId);
    console.log(`[Journal] Удалено ${deletedCount} записей для проекта ${projectId}`);
    return deletedCount;
  } catch (error) {
    console.error("[Journal] Ошибка очистки журнала:", error);
    throw error;
  }
}

// ============================
// Вспомогательные функции
// ============================

/**
 * Форматирует временную метку для отображения
 * @param {Timestamp|number} timestamp - Временная метка
 * @returns {string} Отформатированная дата и время
 */
export function formatJournalTimestamp(timestamp) {
  let date;
  
  if (timestamp && typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else {
    return "—";
  }

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Получает статистику по модулю из журнала
 * @param {Array} entries - Массив записей журнала
 * @param {string} module - Модуль для фильтрации
 * @param {string} construction - Конструкция для фильтрации (опционально)
 * @returns {Object} Статистика: { total, exceeded, lastCheck }
 */
export function getModuleStats(entries, module, construction = null) {
  const filtered = entries.filter(entry => {
    if (entry.module !== module) return false;
    if (construction && entry.construction !== construction) return false;
    return true;
  });

  const total = filtered.length;
  const exceeded = filtered.filter(e => e.status === "exceeded").length;
  
  // Находим последнюю проверку
  let lastCheck = null;
  if (filtered.length > 0) {
    const sorted = [...filtered].sort((a, b) => {
      const tsA = a.timestamp?.toMillis?.() || a.timestamp || 0;
      const tsB = b.timestamp?.toMillis?.() || b.timestamp || 0;
      return tsB - tsA;
    });
    lastCheck = sorted[0].timestamp;
  }

  return {
    total,
    exceeded,
    lastCheck
  };
}
