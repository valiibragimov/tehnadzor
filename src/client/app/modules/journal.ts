import {
  addProjectCollectionDoc,
  clearProjectCollection,
  deleteProjectCollectionDoc,
  getProjectCollectionDocSnapshot,
  getProjectCollectionSnapshot,
  getProjectDocSnapshot,
  mergeProjectDoc,
  watchDocSync
} from "../repositories/firestore-repository.js";
import {
  getConstructionCategoryKey,
  getConstructionLabel,
  normalizeConstructionKey
} from "../construction.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics,
  deleteInspectionAndRefreshAnalytics,
  saveInspectionAndRefreshAnalytics
} from "../services/inspection-sync.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { showNotification, showConfirm } from "../../utils.js";
import {
  createJournalEntry,
  addJournalEntry as addJournalEntryToFirestore,
  loadJournalEntries,
  clearJournal,
  formatJournalTimestamp,
  deleteJournalEntry
} from "../../journal.js";
import type { JournalEntryRecord } from "../../types/module-records.js";

// ============================
//  Журнал проверок
// ============================
const auth = getAuth();
let journalInitialized = false;
let checkSelector = null;
let journalTableBody = null;
let journalStatusFilter = "all";
let journalStatusFilterButtons = [];
let journalStatTotalEl = null;
let journalStatExceededEl = null;

function getEntryConstructionKey(value) {
  return normalizeConstructionKey(value, String(value || "").trim());
}

function getEntryConstructionLabel(entry) {
  return String(
    entry?.constructionLabel ||
    getConstructionLabel(entry?.construction) ||
    entry?.construction ||
    "—"
  ).trim() || "—";
}

function matchesConstructionValue(left, right) {
  return getEntryConstructionKey(left) === getEntryConstructionKey(right);
}

// Флаг для защиты от гонок при навигации по записи журнала
let isNavigatingToEntry = false;
const resolveJournalTimestampMs = (value) => {
  if (value == null) return Date.now();
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  return Date.now();
};

// ============================
//  Event Bus для уведомлений об изменении данных
// ============================
const appEventBus = {
  listeners: {},
  
  /**
   * Подписывается на событие
   * @param {string} event - Название события
   * @param {Function} callback - Функция-обработчик
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  
  /**
   * Отписывается от события
   * @param {string} event - Название события
   * @param {Function} callback - Функция-обработчик
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  },
  
  /**
   * Отправляет событие
   * @param {string} event - Название события
   * @param {*} payload - Данные события
   */
  emit(event, payload) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[EventBus] Ошибка в обработчике события ${event}:`, error);
      }
    });
  }
};

// Экспорт для глобального доступа
window.dispatchAppEvent = (event, payload) => appEventBus.emit(event, payload);

checkSelector = document.getElementById("checkSelector");
journalTableBody = document.querySelector("#journalTable tbody");
journalStatusFilterButtons = Array.from(
  document.querySelectorAll("#journalStatusFilters [data-status-filter]")
);
journalStatTotalEl = document.getElementById("journalStatTotal");
journalStatExceededEl = document.getElementById("journalStatExceeded");

function normalizeJournalStatus(status) {
  const value = (status || "").toString().trim().toLowerCase();
  if (value === "ok" || value === "в норме" || value === "соответствует") return "ok";
  if (value === "exceeded" || value === "превышено" || value === "недобор") return "exceeded";
  return "";
}

function getJournalStatusLabel(status) {
  if (status === "ok") return "В норме";
  if (status === "exceeded") return "Превышено";
  return "—";
}

function applyJournalStatusFilter(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];
  if (journalStatusFilter === "all") return entries;
  return entries.filter((entry) => normalizeJournalStatus(entry?.status) === journalStatusFilter);
}

function syncJournalStatusFilterUI() {
  journalStatusFilterButtons.forEach((btn) => {
    const isActive = btn.dataset.statusFilter === journalStatusFilter;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function renderJournalMiniAnalytics(entries) {
  if (!journalStatTotalEl || !journalStatExceededEl) return;
  const list = Array.isArray(entries) ? entries : [];
  const total = list.length;
  const exceeded = list.reduce((count, entry) => {
    return normalizeJournalStatus(entry?.status) === "exceeded" ? count + 1 : count;
  }, 0);
  journalStatTotalEl.textContent = String(total);
  journalStatExceededEl.textContent = String(exceeded);
}

journalStatusFilterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const nextFilter = btn.dataset.statusFilter || "all";
    if (journalStatusFilter === nextFilter) return;
    journalStatusFilter = nextFilter;
    syncJournalStatusFilterUI();
    renderJournal();
  });
});
syncJournalStatusFilterUI();

function journalStorageKey() {
  const id = currentProjectId || "no_project";
  return `${LS.journal}_${id}`;
}

function loadJournal() {
  try {
    const raw = localStorage.getItem(journalStorageKey());
    journal = raw ? JSON.parse(raw) : [];
  } catch {
    journal = [];
  }
}

function saveJournal() {
  localStorage.setItem(journalStorageKey(), JSON.stringify(journal));
}

const journalSessionsCache = new Map();

function resetJournalSessionsSelect(message) {
  if (!checkSelector) return;
  checkSelector.innerHTML = "";
  const opt = document.createElement("option");
  opt.disabled = true;
  opt.selected = true;
  opt.textContent = message;
  checkSelector.appendChild(opt);
}

async function loadJournalSessionsForProject(projectId) {
  if (!checkSelector) return;
  journalSessionsCache.clear();

  if (!projectId) {
    resetJournalSessionsSelect("Нет сохранённых проверок");
    return;
  }

  resetJournalSessionsSelect("Загрузка...");

  try {
    const snap = await getProjectCollectionSnapshot(projectId, "journalSessions");
    if (snap.empty) {
      resetJournalSessionsSelect("Нет сохранённых проверок");
      return;
    }

    const sessions = [];
    snap.forEach(docSnap => {
      sessions.push({ id: docSnap.id, ...docSnap.data() });
    });
    sessions.sort((a, b) => (b.date || 0) - (a.date || 0));

    checkSelector.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "Выберите проверку";
    checkSelector.appendChild(placeholder);

    sessions.forEach(session => {
      journalSessionsCache.set(session.id, session);
      const opt = document.createElement("option");
      opt.value = session.id;
      opt.textContent = `Проверка №${session.checkNumber || "—"} • ${fmtDate(session.date || Date.now())}`;
      checkSelector.appendChild(opt);
    });
  } catch (e) {
    console.error("[Journal] Ошибка загрузки сохранённых проверок:", e);
    resetJournalSessionsSelect("Не удалось загрузить проверки");
  }
}

if (checkSelector) {
  checkSelector.addEventListener("change", async () => {
    if (!currentProjectId) return;
    const sessionId = checkSelector.value;
    if (!sessionId) return;

    let session = journalSessionsCache.get(sessionId);
    if (!session || !Array.isArray(session.entries)) {
      try {
        const snap = await getProjectCollectionDocSnapshot(currentProjectId, "journalSessions", sessionId);
        if (!snap.exists()) {
          showNotification("Проверка не найдена.", "warning");
          return;
        }
        session = { id: snap.id, ...snap.data() };
        journalSessionsCache.set(sessionId, session);
      } catch (e) {
        console.error("[Journal] Ошибка загрузки проверки:", e);
        showNotification("Не удалось загрузить проверку.", "error");
        return;
      }
    }

    const entries = Array.isArray(session.entries) ? session.entries : [];
    if (!entries.length) {
      showNotification("В выбранной проверке нет записей.", "info");
    }
    journal = entries;
    saveJournal();
    renderJournal();
    updateSummaryTab();
  });
}

/**
 * Загружает записи журнала из Firestore
 */
async function loadJournalFromFirestore() {
  if (!currentProjectId) {
    journalEntries = [];
    journalFilteredEntries = [];
    return;
  }

  try {
    const entries = await loadJournalEntries(currentProjectId);
    journalEntries = Array.isArray(entries) ? entries : [];
    console.log(
      `[Journal] Загружено ${journalEntries.length} записей из Firestore (full set)`
    );

    // Применяем текущий UI-фильтр только к представлению
    applyJournalFilter();

    // Обновляем локальный массив для обратной совместимости (используем отфильтрованный вид)
    journal = journalFilteredEntries.map((entry: JournalEntryRecord) => ({
      id: entry.id,
      ts: resolveJournalTimestampMs(entry.timestamp),
      module: entry.module,
      construction: getEntryConstructionLabel(entry),
      node: entry.context,
      status: entry.status,
      details: entry.details
    }));
    saveJournal();
    renderJournal();
  } catch (error) {
    console.error("[Journal] Ошибка загрузки журнала из Firestore:", error);
    journalEntries = [];
    journalFilteredEntries = [];
  }
}

function fmtDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Добавляет или обновляет запись в журнале и синхронизирует journalEntries
 * @param {Object} params - Параметры записи
 * @param {string} params.module - Модуль
 * @param {string} params.status - Статус ("ok" или "exceeded")
 * @param {string} params.context - Контекст
 * @param {string} params.details - Подробности
 * @param {number} params.exceededCount - Количество превышений (опционально)
 * @param {string} params.sourceId - ID исходной проверки (опционально)
 * @param {string} params.construction - Конструкция (опционально, если не указана, берется из DOM)
 * @returns {Promise<string|null>} ID созданной записи или null
 */
async function upsertJournalEntry({ module, status, context = "", details = "", exceededCount = 0, sourceId = null, construction: providedConstruction = null }) {
  if (!currentProjectId) {
    console.warn("[Journal] Нельзя добавить запись без выбранного проекта");
    return null;
  }

  // Преобразуем старый формат статуса в новый
  let normalizedStatus = status;
  if (status === "в норме" || status === "соответствует") {
    normalizedStatus = "ok";
  } else if (status === "превышено" || status === "недобор") {
    normalizedStatus = "exceeded";
  }

  try {
    // Используем переданную конструкцию или получаем из DOM
    const currentConstruction = normalizeConstructionKey(
      providedConstruction || construction?.dataset?.machineValue || construction?.value || "",
      ""
    );
    const currentConstructionLabel =
      construction?.dataset?.displayLabel ||
      getConstructionLabel(currentConstruction, providedConstruction || construction?.value || "");
    const currentConstructionCategory =
      construction?.dataset?.categoryKey || getConstructionCategoryKey(currentConstruction, "");
    const currentConstructionSubtype = construction?.dataset?.subtypeKey || "";
    const currentConstructionSubtypeLabel = construction?.dataset?.subtypeLabel || "";
    
    if (!currentConstruction) {
      console.warn("[Journal] Конструкция не указана для записи журнала");
    }
    
    const entry = createJournalEntry({
      projectId: currentProjectId,
      module,
      construction: currentConstruction,
      constructionCategory: currentConstructionCategory,
      constructionLabel: currentConstructionLabel,
      constructionSubtype: currentConstructionSubtype,
      constructionSubtypeLabel: currentConstructionSubtypeLabel,
      context,
      status: normalizedStatus,
      exceededCount,
      details,
      sourceId
    }) as JournalEntryRecord;

    // Сохраняем в Firestore
    const entryId = await addJournalEntryToFirestore(entry);
    entry.id = entryId;
    
    console.log("[Journal] upsertJournalEntry: добавлена запись", {
      id: entryId,
      module,
      construction: currentConstruction,
      constructionLabel: currentConstructionLabel,
      sourceId,
      journalEntriesLengthBefore: journalEntries.length
    });

    // Оптимистично добавляем в локальный массив journalEntries (основной источник правды)
    journalEntries.unshift(entry);
    
    // Применяем текущий UI-фильтр к представлению
    applyJournalFilter();
    
    // Обновляем локальный массив для обратной совместимости (CSV/JSON)
    journal = journalFilteredEntries.length > 0 
      ? journalFilteredEntries.map((entry: JournalEntryRecord) => ({
          id: entry.id,
          ts: resolveJournalTimestampMs(entry.timestamp),
          module: entry.module,
          construction: entry.constructionLabel || entry.construction,
          node: entry.context,
          status: entry.status,
          details: entry.details,
          sourceId: entry.sourceId || null
        }))
      : journalEntries.map((entry: JournalEntryRecord) => ({
          id: entry.id,
          ts: resolveJournalTimestampMs(entry.timestamp),
          module: entry.module,
          construction: entry.constructionLabel || entry.construction,
          node: entry.context,
          status: entry.status,
          details: entry.details,
          sourceId: entry.sourceId || null
        }));
    
    saveJournal();
    
    // Обновляем отображение журнала (только если открыта вкладка журнала)
    const journalSection = document.getElementById("journal");
    if (journalSection && journalSection.classList.contains("active")) {
      renderJournal();
    }
    
    // Уведомляем о изменении журнала через event bus
    appEventBus.emit("journal:changed", {
      type: "journal",
      projectId: currentProjectId,
      construction: currentConstruction,
      entryId,
      module
    });
    
    // Обновляем итог
    updateSummaryTab();
    
    console.log("[Journal] upsertJournalEntry: журнал обновлен, длина:", journalEntries.length);
    return entryId;
  } catch (error) {
    console.error("[Journal] Ошибка добавления записи в журнал:", error);
    showNotification("Не удалось сохранить запись в журнал", "error");
    return null;
  }
}

/**
 * Добавляет запись в журнал (обертка для обратной совместимости)
 */
async function addJournalEntry({ module, status, context = "", details = "", exceededCount = 0, sourceId = null, construction = null }) {
  return await upsertJournalEntry({ module, status, context, details, exceededCount, sourceId, construction });
}

/**
 * Применяет текущий UI-фильтр к полному набору записей журнала
 * и заполняет journalFilteredEntries.
 * Итог всегда считает только по journalEntries (полный набор),
 * а UI журнала использует journalFilteredEntries.
 */
function applyJournalFilter() {
  if (!Array.isArray(journalEntries) || journalEntries.length === 0) {
    journalFilteredEntries = [];
    return;
  }

  const moduleNames = {
    geo: "Геодезия",
    reinforcement: "Армирование",
    geometry: "Геометрия",
    strength: "Прочность",
  };

  const expectedModuleName = journalFilterModule
    ? moduleNames[journalFilterModule] || journalFilterModule
    : null;

  journalFilteredEntries = journalEntries.filter(entry => {
    if (!entry) return false;

    if (expectedModuleName && entry.module !== expectedModuleName) {
      return false;
    }

    if (
      journalFilterConstruction &&
      !matchesConstructionValue(entry.construction, journalFilterConstruction)
    ) {
      return false;
    }

    return true;
  });

  console.log(
    "[Journal] applyJournalFilter:",
    "full =", journalEntries.length,
    "filtered =", journalFilteredEntries.length,
    "filter =", { module: journalFilterModule, construction: journalFilterConstruction }
  );
}

/**
 * Устанавливает фильтры журнала и перерисовывает таблицу
 */
async function setJournalFilters(module = null, construction = null) {
  journalFilterModule = module;
  journalFilterConstruction = construction;
  // Применяем фильтр только к представлению, не трогая journalEntries
  applyJournalFilter();

  // Обновляем локальный массив для CSV/JSON по текущему представлению
  journal = journalFilteredEntries.map((entry: JournalEntryRecord) => ({
    id: entry.id,
    ts: resolveJournalTimestampMs(entry.timestamp),
    module: entry.module,
    construction: getEntryConstructionLabel(entry),
    node: entry.context,
    status: entry.status,
    details: entry.details,
  }));

  renderJournal();
}

async function clearInspectionDualWriteForSourceCollection(projectId, sourceCollection) {
  if (!projectId || !sourceCollection) return 0;
  return clearInspectionsByModuleAndRefreshAnalytics(projectId, { sourceCollection });
}

async function clearModuleCollection(collectionName, map, saveFn, renderFn, resetFn) {
  if (!currentProjectId) return;
  try {
    await clearProjectCollection(currentProjectId, collectionName);
    await clearInspectionDualWriteForSourceCollection(currentProjectId, collectionName);
  } catch (error) {
    console.error(`[Journal] Ошибка очистки коллекции ${collectionName}:`, error);
  }

  if (map) {
    map.clear();
  }

  if (typeof resetFn === "function") {
    resetFn();
  }

  if (typeof saveFn === "function") {
    saveFn();
  }

  if (typeof renderFn === "function") {
    renderFn();
  }
}

async function clearAllModuleChecksForProject() {
  await clearModuleCollection(
    "geoNodes",
    nodes,
    saveNodes,
    renderNodes,
    () => {
      currentColumnNodeKey = null;
      currentWallNodeKey = null;
      currentBeamNodeKey = null;
      state.geo = false;
      checked.geo = false;
    }
  );
  await clearModuleCollection(
    "reinfChecks",
    reinfChecks,
    saveReinfChecks,
    renderReinfChecks,
    () => {
      currentReinfCheckId = null;
      state.reinforcement = false;
      checked.reinforcement = false;
    }
  );
  await clearModuleCollection(
    "geomChecks",
    geomChecks,
    saveGeomChecks,
    renderGeomChecks,
    () => {
      currentGeomCheckId = null;
      state.geometry = false;
      checked.geometry = false;
    }
  );
  await clearModuleCollection(
    "strengthChecks",
    strengthChecks,
    saveStrengthChecks,
    renderStrengthChecks,
    () => {
      currentStrengthCheckId = null;
      state.strength = false;
      checked.strength = false;
    }
  );
}

async function deleteModuleCheckFromEntry(entry) {
  if (!currentProjectId || !entry) return;

  const moduleName = entry.module || "";
  let sourceId = entry.sourceId || null;
  const entryTime = resolveJournalTimestampMs(entry.timestamp ?? entry.ts);
  const moduleKey = moduleName.toLowerCase();
  const normalizeMatchValue = (value) =>
    String(value || "").toLowerCase().replace(/\s+/g, "");

  try {
    if (moduleKey.includes("геодез")) {
      if (!sourceId && entry.context) {
        for (const [key, node] of nodes.entries()) {
          if (!node) continue;
          const entryContext = normalizeMatchValue(entry.context);
          const nodeLocation = normalizeMatchValue(node.location);
          if (nodeLocation && entryContext && (entryContext.includes(nodeLocation) || nodeLocation.includes(entryContext))) {
            sourceId = key;
            break;
          }
          if (node.type === "columns" || node.type === "walls" || node.type === "beams") {
            const contextLower = normalizeMatchValue(entry.context);
            const nodeInfo = node.type === "columns"
              ? normalizeMatchValue(`${node.columnMark || ""} ${node.floor || ""}`)
              : normalizeMatchValue(node.floor || "");
            if (contextLower.includes(nodeInfo) || nodeInfo.includes(contextLower)) {
              sourceId = key;
              break;
            }
          } else {
            const nodeId = `${node.letter || ""}-${node.number || ""}`.trim();
            if (entry.context.includes(nodeId) || (nodeId && entry.context.includes(nodeId.split("-")[0]))) {
              sourceId = key;
              break;
            }
          }
        }
      }

      if (!sourceId) return;
      await deleteProjectCollectionDoc(currentProjectId, "geoNodes", sourceId);
      await deleteInspectionAndRefreshAnalytics(currentProjectId, sourceId);
      if (nodes.has(sourceId)) {
        nodes.delete(sourceId);
        saveNodes();
        renderNodes();
      }
      if (currentColumnNodeKey === sourceId) currentColumnNodeKey = null;
      if (currentWallNodeKey === sourceId) currentWallNodeKey = null;
      if (currentBeamNodeKey === sourceId) currentBeamNodeKey = null;
      state.geo = false;
      checked.geo = false;
      return;
    }

    if (moduleKey.includes("арм")) {
      if (!sourceId) {
        let bestMatch = null;
        let bestTimeDiff = Infinity;
        for (const [id, check] of reinfChecks.entries()) {
          if (!check) continue;
          if (entry.construction && check.construction && !matchesConstructionValue(check.construction, entry.construction)) continue;

          const checkTime = Number(check.createdAt || 0);
          const timeDiff = Math.abs(checkTime - entryTime);
          const checkContext = normalizeMatchValue(check.location || check.marking || "");
          const entryContext = normalizeMatchValue(entry.context || "");

          if (entryContext && checkContext && (
            checkContext.includes(entryContext) || entryContext.includes(checkContext)
          )) {
            if (timeDiff < bestTimeDiff) {
              bestMatch = id;
              bestTimeDiff = timeDiff;
            }
          } else if (!entryContext && timeDiff < bestTimeDiff && timeDiff < 60000) {
            bestMatch = id;
            bestTimeDiff = timeDiff;
          }
        }
        sourceId = bestMatch;
      }

      if (!sourceId) return;
      await deleteProjectCollectionDoc(currentProjectId, "reinfChecks", sourceId);
      await deleteInspectionAndRefreshAnalytics(currentProjectId, sourceId);
      if (reinfChecks.has(sourceId)) {
        reinfChecks.delete(sourceId);
        saveReinfChecks();
        renderReinfChecks();
      }
      if (currentReinfCheckId === sourceId) currentReinfCheckId = null;
      state.reinforcement = false;
      checked.reinforcement = false;
      return;
    }

    if (moduleKey.includes("геометр")) {
      if (!sourceId) {
        let bestMatch = null;
        let bestTimeDiff = Infinity;
        for (const [id, check] of geomChecks.entries()) {
          if (!check) continue;
          if (entry.construction && check.construction && !matchesConstructionValue(check.construction, entry.construction)) continue;

          const checkTime = Number(check.createdAt || 0);
          const timeDiff = Math.abs(checkTime - entryTime);
          const checkContext = normalizeMatchValue(check.location || check.stairName || "");
          const entryContext = normalizeMatchValue(entry.context || "");

          if (entryContext && checkContext && (
            checkContext.includes(entryContext) || entryContext.includes(checkContext)
          )) {
            if (timeDiff < bestTimeDiff) {
              bestMatch = id;
              bestTimeDiff = timeDiff;
            }
          } else if (!entryContext && timeDiff < bestTimeDiff && timeDiff < 60000) {
            bestMatch = id;
            bestTimeDiff = timeDiff;
          }
        }
        sourceId = bestMatch;
      }

      if (!sourceId) return;
      await deleteProjectCollectionDoc(currentProjectId, "geomChecks", sourceId);
      await deleteInspectionAndRefreshAnalytics(currentProjectId, sourceId);
      if (geomChecks.has(sourceId)) {
        geomChecks.delete(sourceId);
        saveGeomChecks();
        renderGeomChecks();
      }
      if (currentGeomCheckId === sourceId) currentGeomCheckId = null;
      state.geometry = false;
      checked.geometry = false;
      return;
    }

    if (moduleKey.includes("проч")) {
      if (!sourceId) {
        let bestMatch = null;
        let bestTimeDiff = Infinity;
        for (const [id, check] of strengthChecks.entries()) {
          if (!check) continue;
          if (entry.construction && check.construction && !matchesConstructionValue(check.construction, entry.construction)) continue;

          const checkTime = Number(check.createdAt || 0);
          const timeDiff = Math.abs(checkTime - entryTime);
          if (timeDiff < bestTimeDiff && timeDiff < 60000) {
            bestMatch = id;
            bestTimeDiff = timeDiff;
          }
        }
        sourceId = bestMatch;
      }

      if (!sourceId) return;
      await deleteProjectCollectionDoc(currentProjectId, "strengthChecks", sourceId);
      await deleteInspectionAndRefreshAnalytics(currentProjectId, sourceId);
      if (strengthChecks.has(sourceId)) {
        strengthChecks.delete(sourceId);
        saveStrengthChecks();
        renderStrengthChecks();
      }
      if (currentStrengthCheckId === sourceId) currentStrengthCheckId = null;
      state.strength = false;
      checked.strength = false;
    }
  } catch (error) {
    console.error("[Journal] Ошибка удаления проверки модуля:", error);
  }
}

// Экспортируем функцию для использования в HTML (кнопка "Перейти в журнал")
window.setJournalFilters = setJournalFilters;

// Подписываемся на события изменения журнала
appEventBus.on("journal:changed", (payload) => {
  console.log("[EventBus] journal:changed:", payload);
  // Если открыта вкладка Итог, обновляем её
  const summarySection = document.getElementById("summary");
  if (summarySection && summarySection.classList.contains("active")) {
    console.log("[EventBus] Вкладка Итог активна, обновляем");
    updateSummaryTab();
  }
});

/**
 * Обработчик клика по строке журнала для навигации к соответствующей проверке
 */
async function onJournalRowClick(entry) {
  if (isNavigatingToEntry) {
    console.log("[Journal] Навигация уже выполняется, пропускаем");
    return;
  }

    try {
      isNavigatingToEntry = true;
      console.log("[Journal] Начало навигации к записи:", entry);

      // Шаг 1: Проверяем и переключаем проект, если нужно
      if (entry.projectId && entry.projectId !== currentProjectId) {
        console.log("[Journal] Переключаем проект:", entry.projectId);
        await selectProject(entry.projectId);
        // Ждем для загрузки всех данных проекта (узлы, проверки, журнал)
        await new Promise(resolve => setTimeout(resolve, 800));
        // Перезагружаем журнал, чтобы убедиться, что данные синхронизированы
        await loadJournalFromFirestore();
      }

    // Шаг 2: Устанавливаем конструкцию
    if (entry.construction && construction) {
      const constructionValue = entry.construction;
      if (!matchesConstructionValue(construction.dataset.machineValue || construction.value, constructionValue)) {
        console.log("[Journal] Устанавливаем конструкцию:", constructionValue);
        if (!setConstructionAndTrigger(constructionValue, entry.constructionSubtype || "")) {
          showNotification(`Не удалось установить конструкцию "${constructionValue}"`, "warning");
        }
      }
    }

    // Шаг 3: Переключаем вкладку на нужный модуль
    const moduleTabMap = {
      "Геодезия": "geo",
      "Армирование": "reinforcement",
      "Геометрия": "geometry",
      "Прочность": "strength"
    };

    const targetTab = moduleTabMap[entry.module];
    if (targetTab) {
      console.log("[Journal] Переключаем вкладку на:", targetTab);
      const tabElement = document.querySelector(`.tab[data-target="${targetTab}"]`);
      if (tabElement) {
        tabElement.click();
        // Ждем немного для рендера вкладки
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Шаг 4: Ищем и открываем проверку
    let found = false;

    if (entry.module === "Геодезия") {
      // Ищем узел геодезии
      let targetNodeKey = null;

      // Сначала по sourceId (приоритетно)
      if (entry.sourceId) {
        if (nodes.has(entry.sourceId)) {
          targetNodeKey = entry.sourceId;
          found = true;
        }
      }

      // Если не нашли, ищем по context/nodeId
      if (!found && entry.context) {
        for (const [key, node] of nodes.entries()) {
          if (!node) continue;

          // Для колонн, стен, балок проверяем по маркировке/этажу
          if (node.type === "columns" || node.type === "walls" || node.type === "beams") {
            const contextLower = String(entry.context || "").toLowerCase();
            const nodeInfo = node.type === "columns" 
              ? String(node.columnMark || "").toLowerCase() + " " + String(node.floor || "").toLowerCase()
              : String(node.floor || "").toLowerCase();
            
            if (contextLower.includes(nodeInfo) || nodeInfo.includes(contextLower)) {
              targetNodeKey = key;
              found = true;
              break;
            }
          } else {
            // Для обычных узлов проверяем по nodeId (например, "А-1")
            const nodeId = `${node.letter || ""}-${node.number || ""}`.trim();
            if (entry.context.includes(nodeId) || nodeId && entry.context.includes(nodeId.split("-")[0])) {
              targetNodeKey = key;
              found = true;
              break;
            }
          }
        }
      }

      if (targetNodeKey && nodes.has(targetNodeKey)) {
        console.log("[Journal] Открываем узел геодезии:", targetNodeKey);
        loadNode(targetNodeKey);
        found = true;

        // Прокручиваем к форме
        const geoSection = document.getElementById("geo");
        if (geoSection) {
          geoSection.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            const formCard = geoSection.querySelector(".card");
            if (formCard) {
              formCard.classList.add("highlight");
              setTimeout(() => formCard.classList.remove("highlight"), 2000);
            }
          }, 300);
        }
      }

    } else if (entry.module === "Армирование") {
      // Ищем проверку армирования
      let targetCheckId = null;

      if (entry.sourceId && reinfChecks.has(entry.sourceId)) {
        targetCheckId = entry.sourceId;
        found = true;
      } else {
        // Ищем по совпадению construction + context + ближайшая timestamp
          const entryTime = resolveJournalTimestampMs(entry.timestamp);
        let bestMatch = null;
        let bestTimeDiff = Infinity;

        for (const [id, check] of reinfChecks.entries()) {
          if (!check || !matchesConstructionValue(check.construction, entry.construction)) continue;

          const checkTime = Number(check.createdAt || 0);
          const timeDiff = Math.abs(checkTime - entryTime);

          // Проверяем контекст
          const checkContext = String(check.location || check.marking || "");
          const entryContext = String(entry.context || "");

          if (entryContext && checkContext && (
            checkContext.includes(entryContext) || entryContext.includes(checkContext)
          )) {
            if (timeDiff < bestTimeDiff) {
              bestMatch = id;
              bestTimeDiff = timeDiff;
              found = true;
            }
          } else if (!entryContext && timeDiff < bestTimeDiff && timeDiff < 60000) {
            // Если контекста нет, используем только временную близость (1 минута)
            bestMatch = id;
            bestTimeDiff = timeDiff;
            found = true;
          }
        }

        targetCheckId = bestMatch;
      }

      if (targetCheckId && reinfChecks.has(targetCheckId)) {
        console.log("[Journal] Открываем проверку армирования:", targetCheckId);
        loadReinfCheck(targetCheckId);
        
        // Если это стена, ищем конкретную стену
        if (matchesConstructionValue(entry.construction, "wall") && entry.context) {
          setTimeout(() => {
            const wallMatch = entry.context.match(/Стена\s*(\d+)/i);
            if (wallMatch) {
              const wallIndex = parseInt(wallMatch[1]) - 1;
              const wallsList = document.getElementById("reinfWallsList");
              if (wallsList) {
                const wallItems = wallsList.querySelectorAll(".wall-item, .node");
                if (wallItems[wallIndex]) {
                  wallItems[wallIndex].scrollIntoView({ behavior: "smooth", block: "center" });
                  wallItems[wallIndex].classList.add("highlight");
                  setTimeout(() => wallItems[wallIndex].classList.remove("highlight"), 2000);
                }
              }
            }
          }, 300);
        }

        // Прокручиваем к форме
        const reinfSection = document.getElementById("reinforcement");
        if (reinfSection) {
          reinfSection.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            const formCard = reinfSection.querySelector(".card");
            if (formCard) {
              formCard.classList.add("highlight");
              setTimeout(() => formCard.classList.remove("highlight"), 2000);
            }
          }, 300);
        }
      }

    } else if (entry.module === "Геометрия") {
      // Ищем проверку геометрии
      let targetCheckId = null;

      if (entry.sourceId && geomChecks.has(entry.sourceId)) {
        targetCheckId = entry.sourceId;
        found = true;
      } else {
          const entryTime = resolveJournalTimestampMs(entry.timestamp);
        let bestMatch = null;
        let bestTimeDiff = Infinity;

        for (const [id, check] of geomChecks.entries()) {
          if (!check || !matchesConstructionValue(check.construction, entry.construction)) continue;

          const checkTime = Number(check.createdAt || 0);
          const timeDiff = Math.abs(checkTime - entryTime);

          const checkContext = String(check.location || check.stairName || "");
          const entryContext = String(entry.context || "");

          if (entryContext && checkContext && (
            checkContext.includes(entryContext) || entryContext.includes(checkContext)
          )) {
            if (timeDiff < bestTimeDiff) {
              bestMatch = id;
              bestTimeDiff = timeDiff;
              found = true;
            }
          } else if (!entryContext && timeDiff < bestTimeDiff && timeDiff < 60000) {
            bestMatch = id;
            bestTimeDiff = timeDiff;
            found = true;
          }
        }

        targetCheckId = bestMatch;
      }

      if (targetCheckId && geomChecks.has(targetCheckId)) {
        console.log("[Journal] Открываем проверку геометрии:", targetCheckId);
        loadGeomCheck(targetCheckId);

        // Если это стена, ищем конкретную стену
        if (matchesConstructionValue(entry.construction, "wall") && entry.context) {
          setTimeout(() => {
            const wallMatch = entry.context.match(/Стена\s*(\d+)/i);
            if (wallMatch) {
              const wallIndex = parseInt(wallMatch[1]) - 1;
              const wallsList = document.getElementById("geomWallsList");
              if (wallsList) {
                const wallItems = wallsList.querySelectorAll(".wall-item, .node");
                if (wallItems[wallIndex]) {
                  wallItems[wallIndex].scrollIntoView({ behavior: "smooth", block: "center" });
                  wallItems[wallIndex].classList.add("highlight");
                  setTimeout(() => wallItems[wallIndex].classList.remove("highlight"), 2000);
                }
              }
            }
          }, 300);
        }

        const geomSection = document.getElementById("geometry");
        if (geomSection) {
          geomSection.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            const formCard = geomSection.querySelector(".card");
            if (formCard) {
              formCard.classList.add("highlight");
              setTimeout(() => formCard.classList.remove("highlight"), 2000);
            }
          }, 300);
        }
      }

    } else if (entry.module === "Прочность") {
      // Ищем проверку прочности
      let targetCheckId = null;

      if (entry.sourceId && strengthChecks.has(entry.sourceId)) {
        targetCheckId = entry.sourceId;
        found = true;
      } else {
          const entryTime = resolveJournalTimestampMs(entry.timestamp);
        let bestMatch = null;
        let bestTimeDiff = Infinity;

        for (const [id, check] of strengthChecks.entries()) {
          if (!check || !matchesConstructionValue(check.construction, entry.construction)) continue;

          const checkTime = Number(check.createdAt || 0);
          const timeDiff = Math.abs(checkTime - entryTime);

          if (timeDiff < bestTimeDiff && timeDiff < 60000) {
            bestMatch = id;
            bestTimeDiff = timeDiff;
            found = true;
          }
        }

        targetCheckId = bestMatch;
      }

      if (targetCheckId && strengthChecks.has(targetCheckId)) {
        console.log("[Journal] Открываем проверку прочности:", targetCheckId);
        loadStrengthCheck(targetCheckId);

        const strengthSection = document.getElementById("strength");
        if (strengthSection) {
          strengthSection.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            const formCard = strengthSection.querySelector(".card");
            if (formCard) {
              formCard.classList.add("highlight");
              setTimeout(() => formCard.classList.remove("highlight"), 2000);
            }
          }, 300);
        }
      }
    }

    if (!found) {
      console.log("[Journal] Не удалось найти исходную проверку для записи:", entry);
      showNotification("Не удалось найти исходную проверку, открыта вкладка модуля", "info");
    } else {
      console.log("[Journal] Навигация успешно завершена");
    }

  } catch (error) {
    console.error("[Journal] Ошибка при навигации к записи:", error);
    showNotification("Ошибка при переходе к проверке", "error");
  } finally {
    isNavigatingToEntry = false;
  }
}

/**
 * Отрисовка журнала: UI-слой (бейджи статуса, компактные действия, фильтрация отображения)
 */
function renderJournal() {
  if (!journalTableBody) return;

  journalTableBody.innerHTML = "";

  // Используем отфильтрованный набор, если он есть; иначе — полный набор из Firestore;
  // если и его нет (офлайн-режим без Firestore) — используем legacy journal из localStorage.
  let entriesToRender = [];
  if (journalFilteredEntries.length > 0 || journalFilterModule || journalFilterConstruction) {
    entriesToRender = journalFilteredEntries;
  } else if (journalEntries.length > 0) {
    entriesToRender = journalEntries;
  } else {
    entriesToRender = journal.map(e => ({
      id: e.id,
      timestamp: e.ts,
      module: e.module,
      construction: e.construction,
      context: e.node || e.context,
      status: e.status,
      details: e.details,
      projectId: currentProjectId || null,
      sourceId: e.sourceId || null
    }));
  }

  renderJournalMiniAnalytics(entriesToRender);
  entriesToRender = applyJournalStatusFilter(entriesToRender);

  if (entriesToRender.length === 0) {
    const trEmpty = document.createElement("tr");
    const tdEmpty = document.createElement("td");
    tdEmpty.colSpan = 7;
    tdEmpty.className = "journal-empty-cell";
    tdEmpty.textContent = "Нет записей для выбранного фильтра";
    trEmpty.appendChild(tdEmpty);
    journalTableBody.appendChild(trEmpty);
    return;
  }

  entriesToRender.forEach((e, idx) => {
    const entryId = e.id || `entry_${idx}`;
    const timestamp = e.timestamp?.toMillis?.() || e.ts || Date.now();
    
    // Формируем полную запись со всеми полями для передачи в onJournalRowClick
    // Обрабатываем как записи из Firestore (с timestamp объектом), так и legacy из localStorage
    const fullEntry = {
      id: entryId,
      projectId: e.projectId || currentProjectId || null,
      module: e.module || "",
      construction: e.construction || "",
      context: e.context || e.node || "",
      status: e.status || "",
      details: e.details || "",
      timestamp: e.timestamp || e.ts || timestamp,
      sourceId: e.sourceId || null,
      exceededCount: e.exceededCount || 0
    };
    
    const tr = document.createElement("tr");
    tr.dataset.idx = String(idx);
    tr.dataset.entryId = entryId;
    tr.className = "journal-row-clickable";
    tr.style.cursor = "pointer";
    tr.style.position = "relative";
    tr.setAttribute("tabindex", "0");
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `Открыть проверку: ${fullEntry.module || ""} ${getEntryConstructionLabel(fullEntry)}`);

    const tdTime = document.createElement("td");
    tdTime.textContent = formatJournalTimestamp(timestamp);

    const tdModule = document.createElement("td");
    tdModule.textContent = fullEntry.module || "";

    const tdConstr = document.createElement("td");
    tdConstr.textContent = getEntryConstructionLabel(fullEntry);

    const tdNode = document.createElement("td");
    tdNode.textContent = fullEntry.context || "—";

    const tdStatus = document.createElement("td");
    const normalizedStatus = normalizeJournalStatus(fullEntry.status);
    const statusBadge = document.createElement("span");
    statusBadge.className = `journal-status-badge ${normalizedStatus || "unknown"}`;
    statusBadge.textContent = getJournalStatusLabel(normalizedStatus);
    tdStatus.appendChild(statusBadge);
    if (normalizedStatus === "exceeded") {
      tr.classList.add("journal-row-exceeded");
    }

    const tdDetails = document.createElement("td");
    tdDetails.textContent = fullEntry.details || "";
    tdDetails.style.whiteSpace = "pre-wrap";

    const tdActions = document.createElement("td");
    tdActions.className = "journal-actions-cell";
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "journal-delete-btn";
    btnDel.title = "Удалить запись";
    btnDel.setAttribute("aria-label", "Удалить запись");
    btnDel.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18"></path>
        <path d="M8 6V4h8v2"></path>
        <path d="M19 6l-1 14H6L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
      </svg>
    `;
    btnDel.addEventListener("click", async (event) => {
      event.stopPropagation(); // Предотвращаем клик по строке
      if (!(await showConfirm("Удалить эту запись журнала?"))) return;
      
      try {
        // Удаляем из Firestore, если есть ID
        if (entryId && entryId.startsWith && !entryId.startsWith("entry_")) {
          await deleteJournalEntry(entryId);
        }
        
        // Удаляем из полного набора и пересчитываем представление
        journalEntries = journalEntries.filter(item => item.id !== entryId);
        applyJournalFilter();

        await deleteModuleCheckFromEntry(fullEntry);

        // Обновляем локальный массив для CSV/JSON по текущему представлению
        journal = journalFilteredEntries.map((entry: JournalEntryRecord) => ({
          id: entry.id,
          ts: resolveJournalTimestampMs(entry.timestamp),
          module: entry.module,
          construction: getEntryConstructionLabel(entry),
          node: entry.context,
          status: entry.status,
          details: entry.details,
        }));

        saveJournal();
        renderJournal();
        updateSummaryTab();
        showNotification("Запись удалена", "success");
      } catch (error) {
        console.error("[Journal] Ошибка удаления записи:", error);
        showNotification("Не удалось удалить запись", "error");
      }
    });
    tdActions.appendChild(btnDel);

    // Обработчик клика по строке (кроме кнопки удаления)
    tr.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return; // Клик по кнопке - игнорируем
      }
      tr.classList.add("is-navigating");
      setTimeout(() => tr.classList.remove("is-navigating"), 300);
      onJournalRowClick(fullEntry);
    });

    // Поддержка клавиатуры (Enter для активации)
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        tr.classList.add("is-navigating");
        setTimeout(() => tr.classList.remove("is-navigating"), 300);
        onJournalRowClick(fullEntry);
      }
    });

    tr.appendChild(tdTime);
    tr.appendChild(tdModule);
    tr.appendChild(tdConstr);
    tr.appendChild(tdNode);
    tr.appendChild(tdStatus);
    tr.appendChild(tdDetails);
    tr.appendChild(tdActions);

    journalTableBody.appendChild(tr);
  });
}

function journalToCsv() {
  const header = [
    "Время",
    "Модуль",
    "Конструкция",
    "Узел/Контекст",
    "Статус",
    "Детали"
  ];
  const rows = journal.map(e => [
    fmtDate(e.ts),
    e.module,
    e.construction || "",
    e.node || "",
    e.status || "",
    String(e.details || "").replace(/\n/g, " ")
  ]);
  const csv = [header, ...rows]
    .map(r =>
      r
        .map(v => {
          const s = String(v).replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",")
    )
    .join("\n");
  return csv;
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function notifyFirestoreSyncStatus(docRef) {
  if (!docRef) return;

  if (!navigator.onLine) {
    showNotification("Сохранено локально (ожидает синхронизации)", "info");
  }

  const unsubscribe = watchDocSync(
    docRef,
    (snap) => {
      const syncSnapshot = snap as JournalEntryRecord;
      if (syncSnapshot.metadata?.hasPendingWrites) return;
      unsubscribe();
    },
    (error) => {
      console.warn("[Firestore] sync status listener error:", error);
      unsubscribe();
    }
  );
}

document
  .getElementById("btnJournalSaveToProject")
  .addEventListener("click", async () => {
    if (!currentProjectId) {
      showNotification("Сначала выберите или создайте объект.", "warning");
      return;
    }
    if (!journal.length) {
      showNotification("Журнал пустой — сохранять нечего.", "info");
      return;
    }

    try {
      const snap = await getProjectDocSnapshot(currentProjectId);
      const projectData = snap.exists() ? snap.data() || {} : {};

      let lastNumber = 0;
      lastNumber = projectData.lastCheckNumber || 0;

      const checkNumber = lastNumber + 1;
      const nowTs = Date.now();
      const authUid = String(auth.currentUser?.uid || "").trim();
      const ownerUid = String(projectData.ownerUid || projectData.createdBy || authUid || "").trim();
      const createdBy = String(projectData.createdBy || projectData.ownerUid || authUid || "").trim();
      const contractorName = String(projectData.contractorName || "").trim();

      const sessionPayload: Record<string, unknown> & { ownerUid?: string; createdBy?: string } = {
        checkNumber,
        date: nowTs,
        entries: journal,
        createdAt: nowTs,
        updatedAt: nowTs,
        contractorName
      };
      if (ownerUid) sessionPayload.ownerUid = ownerUid;
      if (createdBy) sessionPayload.createdBy = createdBy;

      const savedSession = await addProjectCollectionDoc(
        currentProjectId,
        "journalSessions",
        sessionPayload
      );

      const inspectionPayload = {
        ...sessionPayload,
        projectId: currentProjectId,
        sessionId: savedSession.id,
        sourceCollection: "journalSessions",
        sourceSessionId: savedSession.id,
        entriesCount: Array.isArray(journal) ? journal.length : 0
      };
      await saveInspectionAndRefreshAnalytics(
        currentProjectId,
        savedSession.id,
        inspectionPayload,
        { merge: true }
      );

      const projectPatch: Record<string, unknown> & { ownerUid?: string; createdBy?: string } = {
        lastCheckNumber: checkNumber,
        lastCheckDate: nowTs,
        contractorName
      };
      if (ownerUid) projectPatch.ownerUid = ownerUid;
      if (createdBy) projectPatch.createdBy = createdBy;
      await mergeProjectDoc(currentProjectId, projectPatch);

      showNotification(`Журнал сохранён как проверка №${checkNumber}.`, "success");
      await loadJournalSessionsForProject(currentProjectId);
    } catch (e) {
      console.error("Ошибка сохранения журнала:", e);
      showNotification("Не удалось сохранить журнал для объекта.", "error");
    }
  });

document.getElementById("btnJournalExportCsv").addEventListener("click", () => {
  const csv = journalToCsv();
  const csvWithBom = "\uFEFF" + csv;
  download("journal.csv", new Blob([csvWithBom], { type: "text/csv;charset=utf-8" }));
});

document.getElementById("btnJournalExportJson").addEventListener("click", () => {
  download(
    "journal.json",
    new Blob([JSON.stringify(journal, null, 2)], { type: "application/json" })
  );
});

document
  .getElementById("btnJournalImportJson")
  .addEventListener("click", () => {
    document.getElementById("journalFileInput").click();
  });

document
  .getElementById("journalFileInput")
  .addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result !== "string") {
          throw new Error("Неверный формат файла журнала");
        }
        const data = JSON.parse(reader.result);
        if (Array.isArray(data)) {
          journal = data.concat(journal);
          saveJournal();
          renderJournal();
          showNotification("Импорт журнала выполнен.", "success");
        } else {
          showNotification("Неверный формат JSON.", "error");
        }
      } catch {
        showNotification("Ошибка чтения JSON.", "error");
      }
    };
    reader.readAsText(file, "utf-8");
  });

document.getElementById("btnJournalClear").addEventListener("click", async () => {
  if (!currentProjectId) {
    showNotification("Сначала выберите объект", "warning");
    return;
  }
  
  if (await showConfirm("Очистить весь журнал этого объекта? Все записи будут удалены из Firestore.")) {
    try {
      const deletedCount = await clearJournal(currentProjectId);
      journal = [];
      journalEntries = [];
      journalFilteredEntries = [];
      journalFilterModule = null;
      journalFilterConstruction = null;
      saveJournal();
      renderJournal();
      await clearAllModuleChecksForProject();
      updateSummaryTab();
      showNotification(`Удалено ${deletedCount} записей из журнала`, "success");
    } catch (error) {
      console.error("[Journal] Ошибка очистки журнала:", error);
      showNotification("Не удалось очистить журнал", "error");
    }
  }
});

loadJournal(); // Загружаем из localStorage для обратной совместимости
// Загружаем из Firestore при инициализации
const restoreOnce = localStorage.getItem("journal_restore_once") === "1";
const restoreProject = localStorage.getItem("journal_restore_project");
const shouldRestoreLocalJournal = restoreOnce && restoreProject === currentProjectId;

if (currentProjectId) {
  if (shouldRestoreLocalJournal) {
    renderJournal();
    updateSummaryTab();
    localStorage.removeItem("journal_restore_once");
    localStorage.removeItem("journal_restore_project");
  } else {
    loadJournalFromFirestore();
  }
} else {
  renderJournal();
}

export function initJournalModule() {
  if (journalInitialized) return;
  journalInitialized = true;
}

export {
  upsertJournalEntry,
  addJournalEntry,
  applyJournalFilter,
  loadJournalFromFirestore,
  loadJournalSessionsForProject,
  loadJournal,
  notifyFirestoreSyncStatus,
  saveJournal,
  renderJournal,
  setJournalFilters
};

