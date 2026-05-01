/**
 * Модуль армирования
 * Содержит функции для работы с колоннами, балками, стенами и обычными проверками армирования
 */

import { APP_CONFIG } from "./config.js";
import { showNotification, normalizeMarking } from "./utils.js";

// ============================
// Состояние модуля
// ============================
let reinfColumns = [];
let reinfBeams = [];
let reinfWalls = [];

// ============================
// Экспортируемые функции для работы с колоннами в армировании
// ============================

/**
 * Проверяет дубликаты маркировки колонн
 * @param {string} marking - Маркировка для проверки
 * @param {number|null} excludeId - ID элемента для исключения из проверки
 * @returns {boolean} true если дубликат найден
 */
export function checkReinfColumnDuplicate(marking, excludeId = null) {
  const normalizedMarking = normalizeMarking(marking);
  if (!normalizedMarking) return false;
  return reinfColumns.some(col => {
    if (col.id === excludeId) return false;
    const normalizedColMarking = normalizeMarking(col.marking);
    return normalizedColMarking && normalizedMarking === normalizedColMarking;
  });
}

/**
 * Добавляет новую колонну для армирования
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addReinfColumn(renderCallback) {
  if (reinfColumns.length >= APP_CONFIG.MAX_ELEMENTS) {
    showNotification(`Максимальное количество колонн - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
    return;
  }
  
  const newColumn = {
    id: Date.now(),
    marking: "",
    projDia: "",
    factDia: "",
    projStep: "",
    factStep: "",
    projCover: "",
    factCover: "",
    projHoopsStep: "",
    factHoopsStep: ""
  };
  
  reinfColumns.push(newColumn);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет колонну по ID
 * @param {number} id - ID колонны
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeReinfColumn(id, renderCallback) {
  reinfColumns = reinfColumns.filter(c => c.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив колонн для армирования
 * @returns {Array} Массив колонн
 */
export function getReinfColumns() {
  return reinfColumns;
}

/**
 * Устанавливает массив колонн для армирования
 * @param {Array} newColumns - Новый массив колонн
 */
export function setReinfColumns(newColumns) {
  reinfColumns = newColumns || [];
}

// ============================
// Экспортируемые функции для работы с балками в армировании
// ============================

/**
 * Проверяет дубликаты маркировки балок
 * @param {string} marking - Маркировка для проверки
 * @param {number|null} excludeId - ID элемента для исключения из проверки
 * @returns {boolean} true если дубликат найден
 */
export function checkReinfBeamDuplicate(marking, excludeId = null) {
  const normalizedMarking = normalizeMarking(marking);
  if (!normalizedMarking) return false;
  return reinfBeams.some(beam => {
    if (beam.id === excludeId) return false;
    const normalizedBeamMarking = normalizeMarking(beam.marking);
    return normalizedBeamMarking && normalizedMarking === normalizedBeamMarking;
  });
}

/**
 * Добавляет новую балку для армирования
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addReinfBeam(renderCallback) {
  if (reinfBeams.length >= APP_CONFIG.MAX_ELEMENTS) {
    showNotification(`Максимальное количество балок - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
    return;
  }
  
  const newBeam = {
    id: Date.now(),
    marking: "",
    projDia: "",
    factDia: "",
    projStep: "",
    factStep: "",
    projCover: "",
    factCover: ""
  };
  
  reinfBeams.push(newBeam);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет балку по ID
 * @param {number} id - ID балки
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeReinfBeam(id, renderCallback) {
  reinfBeams = reinfBeams.filter(b => b.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив балок для армирования
 * @returns {Array} Массив балок
 */
export function getReinfBeams() {
  return reinfBeams;
}

/**
 * Устанавливает массив балок для армирования
 * @param {Array} newBeams - Новый массив балок
 */
export function setReinfBeams(newBeams) {
  reinfBeams = newBeams || [];
}

// ============================
// Экспортируемые функции для работы со стенами в армировании
// ============================

/**
 * Проверяет дубликаты стен по комбинации осей
 * @param {string} bindingType - Тип привязки: "number_letters" или "letter_numbers"
 * @param {string} numberAxis - Цифровая ось (для number_letters)
 * @param {string} letterAxis1 - Первая буквенная ось (для number_letters)
 * @param {string} letterAxis2 - Вторая буквенная ось (для number_letters)
 * @param {string} letterAxis - Буквенная ось (для letter_numbers)
 * @param {string} numberAxis1 - Первая цифровая ось (для letter_numbers)
 * @param {string} numberAxis2 - Вторая цифровая ось (для letter_numbers)
 * @param {number|null} excludeId - ID элемента для исключения из проверки
 * @returns {boolean} true если дубликат найден
 */
export function checkReinfWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
  if (bindingType === "number_letters") {
    if (!numberAxis || !letterAxis1 || !letterAxis2) return false;
  } else {
    if (!letterAxis || !numberAxis1 || !numberAxis2) return false;
  }
  
  return reinfWalls.some(wall => {
    if (wall.id === excludeId) return false;
    
    if (bindingType === "number_letters" && wall.bindingType === "number_letters") {
      if (!wall.numberAxis || !wall.letterAxis1 || !wall.letterAxis2) return false;
      const letters1 = [letterAxis1, letterAxis2].sort().join("-");
      const letters2 = [wall.letterAxis1, wall.letterAxis2].sort().join("-");
      return numberAxis === wall.numberAxis && letters1 === letters2;
    } else if (bindingType === "letter_numbers" && wall.bindingType === "letter_numbers") {
      if (!wall.letterAxis || !wall.numberAxis1 || !wall.numberAxis2) return false;
      const nums1 = [numberAxis1, numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
      const nums2 = [wall.numberAxis1, wall.numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
      return letterAxis === wall.letterAxis && nums1 === nums2;
    }
    return false;
  });
}

/**
 * Добавляет новую стену для армирования
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addReinfWall(renderCallback, maxWalls = APP_CONFIG.MAX_ELEMENTS) {
  if (reinfWalls.length >= maxWalls) {
    showNotification(`Максимальное количество стен - ${maxWalls}`, "warning");
    return;
  }
  
  const newWall = {
    id: Date.now(),
    bindingType: "number_letters",
    numberAxis: "",
    letterAxis1: "",
    letterAxis2: "",
    letterAxis: "",
    numberAxis1: "",
    numberAxis2: "",
    projDia: "",
    factDia: "",
    projStep: "",
    factStep: "",
    projCover: "",
    factCover: ""
  };
  
  if (checkReinfWallDuplicate(
    newWall.bindingType,
    newWall.numberAxis,
    newWall.letterAxis1,
    newWall.letterAxis2,
    newWall.letterAxis,
    newWall.numberAxis1,
    newWall.numberAxis2
  )) {
    showNotification("Стена с такими же осями уже существует. Измените оси для новой стены.", "warning");
    return;
  }
  
  reinfWalls.push(newWall);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет стену по ID
 * @param {number} id - ID стены
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeReinfWall(id, renderCallback) {
  reinfWalls = reinfWalls.filter(w => w.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив стен для армирования
 * @returns {Array} Массив стен
 */
export function getReinfWalls() {
  return reinfWalls;
}

/**
 * Устанавливает массив стен для армирования
 * @param {Array} newWalls - Новый массив стен
 */
export function setReinfWalls(newWalls) {
  reinfWalls = newWalls || [];
}

// ============================
// Вспомогательные функции
// ============================

/**
 * Очищает все данные модуля
 */
export function clearAll() {
  reinfColumns = [];
  reinfBeams = [];
  reinfWalls = [];
}

/**
 * Очищает данные для указанного типа конструкции
 * @param {string} constructionType - Тип конструкции: "Колонна", "Балка", "Стена"
 */
export function clearByType(constructionType) {
  if (constructionType === "Колонна") {
    reinfColumns = [];
  } else if (constructionType === "Балка") {
    reinfBeams = [];
  } else if (constructionType === "Стена") {
    reinfWalls = [];
  }
}
