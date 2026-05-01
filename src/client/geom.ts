/**
 * Модуль геометрии
 * Содержит функции для работы с колоннами, стенами, лестницами, балками и плитами в разделе геометрии
 */

import { APP_CONFIG } from "./config.js";
import { showNotification, normalizeMarking, defaultRusLetters, defaultNumbers } from "./utils.js";

// ============================
// Состояние модуля
// ============================
let geomColumns = [];
let geomWalls = [];
let geomStairs = [];
let geomBeams = [];

function getFirstDifferentOption(options, currentValue) {
  return options.find((item) => item !== currentValue) || options[0] || "";
}

function findAvailableWallAxes(bindingType) {
  if (bindingType === "letter_numbers") {
    for (const letterAxis of defaultRusLetters) {
      for (let firstIndex = 0; firstIndex < defaultNumbers.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < defaultNumbers.length; secondIndex += 1) {
          const numberAxis1 = defaultNumbers[firstIndex];
          const numberAxis2 = defaultNumbers[secondIndex];
          if (!checkGeomWallDuplicate(bindingType, "", "", "", letterAxis, numberAxis1, numberAxis2)) {
            return { letterAxis, numberAxis1, numberAxis2 };
          }
        }
      }
    }

    return {
      letterAxis: defaultRusLetters[0] || "",
      numberAxis1: defaultNumbers[0] || "",
      numberAxis2: defaultNumbers[1] || defaultNumbers[0] || ""
    };
  }

  for (const numberAxis of defaultNumbers) {
    for (let firstIndex = 0; firstIndex < defaultRusLetters.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < defaultRusLetters.length; secondIndex += 1) {
        const letterAxis1 = defaultRusLetters[firstIndex];
        const letterAxis2 = defaultRusLetters[secondIndex];
        if (!checkGeomWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, "", "", "")) {
          return { numberAxis, letterAxis1, letterAxis2 };
        }
      }
    }
  }

  return {
    numberAxis: defaultNumbers[0] || "",
    letterAxis1: defaultRusLetters[0] || "",
    letterAxis2: defaultRusLetters[1] || defaultRusLetters[0] || ""
  };
}

// ============================
// Экспортируемые функции для работы с колоннами в геометрии
// ============================

/**
 * Проверяет дубликаты маркировки колонн
 * @param {string} marking - Маркировка для проверки
 * @param {number|null} excludeId - ID элемента для исключения из проверки
 * @returns {boolean} true если дубликат найден
 */
export function checkGeomColumnDuplicate(marking, excludeId = null) {
  const normalizedMarking = normalizeMarking(marking);
  if (!normalizedMarking) return false;
  return geomColumns.some(col => {
    if (col.id === excludeId) return false;
    const normalizedColMarking = normalizeMarking(col.marking);
    return normalizedColMarking && normalizedMarking === normalizedColMarking;
  });
}

/**
 * Добавляет новую колонну для геометрии
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addGeomColumn(renderCallback) {
  if (geomColumns.length >= APP_CONFIG.MAX_ELEMENTS) {
    showNotification(`Максимальное количество колонн - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
    return;
  }
  
  const newColumn = {
    id: Date.now(),
    marking: "",
    projSize1: "",
    factSize1: "",
    projSize2: "",
    factSize2: "",
    vertDev: ""
  };
  
  if (checkGeomColumnDuplicate(newColumn.marking)) {
    showNotification("Колонна с такой маркировкой уже существует. Введите другую маркировку.", "warning");
    return;
  }
  
  geomColumns.push(newColumn);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет колонну по ID
 * @param {number} id - ID колонны
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeGeomColumn(id, renderCallback) {
  geomColumns = geomColumns.filter(c => c.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив колонн для геометрии
 * @returns {Array} Массив колонн
 */
export function getGeomColumns() {
  return geomColumns;
}

/**
 * Устанавливает массив колонн для геометрии
 * @param {Array} newColumns - Новый массив колонн
 */
export function setGeomColumns(newColumns) {
  geomColumns = newColumns || [];
}

// ============================
// Экспортируемые функции для работы со стенами в геометрии
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
export function checkGeomWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
  if (bindingType === "number_letters") {
    if (!numberAxis || !letterAxis1 || !letterAxis2) return false;
  } else {
    if (!letterAxis || !numberAxis1 || !numberAxis2) return false;
  }
  
  return geomWalls.some(wall => {
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
 * Добавляет новую стену для геометрии
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addGeomWall(renderCallback, maxWalls = APP_CONFIG.MAX_ELEMENTS) {
  if (geomWalls.length >= maxWalls) {
    showNotification(`Максимальное количество стен - ${maxWalls}`, "warning");
    return;
  }
  
  const newWall = {
    id: Date.now(),
    bindingType: "number_letters",
    ...findAvailableWallAxes("number_letters"),
    letterAxis: "",
    numberAxis1: "",
    numberAxis2: "",
    projThick: "",
    factThick: "",
    vertDev: "",
    projOpeningSizes: "",
    factOpeningSizes: "",
    projOpeningHeight: "",
    factOpeningHeight: "",
    factWallFlatness: ""
  };
  
  if (checkGeomWallDuplicate(
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
  
  geomWalls.push(newWall);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет стену по ID
 * @param {number} id - ID стены
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeGeomWall(id, renderCallback) {
  geomWalls = geomWalls.filter(w => w.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив стен для геометрии
 * @returns {Array} Массив стен
 */
export function getGeomWalls() {
  return geomWalls;
}

/**
 * Устанавливает массив стен для геометрии
 * @param {Array} newWalls - Новый массив стен
 */
export function setGeomWalls(newWalls) {
  geomWalls = newWalls || [];
}

// ============================
// Экспортируемые функции для работы с лестницами в геометрии
// ============================

/**
 * Проверяет дубликаты лестниц по комбинации осей и названию
 * @param {string} bindingType - Тип привязки: "number_letters" или "letter_numbers"
 * @param {string} numberAxis - Цифровая ось (для number_letters)
 * @param {string} letterAxis1 - Первая буквенная ось (для number_letters)
 * @param {string} letterAxis2 - Вторая буквенная ось (для number_letters)
 * @param {string} letterAxis - Буквенная ось (для letter_numbers)
 * @param {string} numberAxis1 - Первая цифровая ось (для letter_numbers)
 * @param {string} numberAxis2 - Вторая цифровая ось (для letter_numbers)
 * @param {string} stairName - Название лестницы
 * @param {number|null} excludeId - ID элемента для исключения из проверки
 * @returns {boolean} true если дубликат найден
 */
export function checkGeomStairDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, stairName, excludeId = null) {
  if (bindingType === "number_letters") {
    if (!numberAxis || !letterAxis1 || !letterAxis2) return false;
  } else {
    if (!letterAxis || !numberAxis1 || !numberAxis2) return false;
  }
  if (!stairName) return false;
  
  return geomStairs.some(stair => {
    if (stair.id === excludeId) return false;
    
    if (bindingType === "number_letters" && stair.bindingType === "number_letters") {
      if (!stair.numberAxis || !stair.letterAxis1 || !stair.letterAxis2) return false;
      const letters1 = [letterAxis1, letterAxis2].sort().join("-");
      const letters2 = [stair.letterAxis1, stair.letterAxis2].sort().join("-");
      return numberAxis === stair.numberAxis && letters1 === letters2 && stairName.trim() === stair.stairName.trim();
    } else if (bindingType === "letter_numbers" && stair.bindingType === "letter_numbers") {
      if (!stair.letterAxis || !stair.numberAxis1 || !stair.numberAxis2) return false;
      const nums1 = [numberAxis1, numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
      const nums2 = [stair.numberAxis1, stair.numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
      return letterAxis === stair.letterAxis && nums1 === nums2 && stairName.trim() === stair.stairName.trim();
    }
    return false;
  });
}

/**
 * Добавляет новую лестницу для геометрии
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addGeomStair(renderCallback) {
  if (geomStairs.length >= APP_CONFIG.MAX_ELEMENTS) {
    showNotification(`Максимальное количество лестниц - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
    return;
  }
  
  const newStair = {
    id: Date.now(),
    bindingType: "number_letters",
    numberAxis: defaultNumbers[0] || "",
    letterAxis1: defaultRusLetters[0] || "",
    letterAxis2: getFirstDifferentOption(defaultRusLetters, defaultRusLetters[0] || ""),
    letterAxis: defaultRusLetters[0] || "",
    numberAxis1: defaultNumbers[0] || "",
    numberAxis2: getFirstDifferentOption(defaultNumbers, defaultNumbers[0] || ""),
    stairName: "",
    projStepHeight: "",
    factStepHeight: "",
    projStepWidth: "",
    factStepWidth: "",
    projFlightWidth: "",
    factFlightWidth: ""
  };
  
  if (checkGeomStairDuplicate(
    newStair.bindingType,
    newStair.numberAxis,
    newStair.letterAxis1,
    newStair.letterAxis2,
    newStair.letterAxis,
    newStair.numberAxis1,
    newStair.numberAxis2,
    newStair.stairName
  )) {
    showNotification("Лестница с такими же осями и названием уже существует. Измените параметры для новой лестницы.", "warning");
    return;
  }
  
  geomStairs.push(newStair);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет лестницу по ID
 * @param {number} id - ID лестницы
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeGeomStair(id, renderCallback) {
  geomStairs = geomStairs.filter(s => s.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив лестниц для геометрии
 * @returns {Array} Массив лестниц
 */
export function getGeomStairs() {
  return geomStairs;
}

/**
 * Устанавливает массив лестниц для геометрии
 * @param {Array} newStairs - Новый массив лестниц
 */
export function setGeomStairs(newStairs) {
  geomStairs = newStairs || [];
}

// ============================
// Экспортируемые функции для работы с балками в геометрии
// ============================

/**
 * Проверяет дубликаты маркировки балок
 * @param {string} marking - Маркировка для проверки
 * @param {number|null} excludeId - ID элемента для исключения из проверки
 * @returns {boolean} true если дубликат найден
 */
export function checkGeomBeamDuplicate(marking, excludeId = null) {
  const normalizedMarking = normalizeMarking(marking);
  if (!normalizedMarking) return false;
  return geomBeams.some(beam => {
    if (beam.id === excludeId) return false;
    const normalizedBeamMarking = normalizeMarking(beam.marking);
    return normalizedBeamMarking && normalizedMarking === normalizedBeamMarking;
  });
}

/**
 * Добавляет новую балку для геометрии
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function addGeomBeam(renderCallback) {
  if (geomBeams.length >= APP_CONFIG.MAX_ELEMENTS) {
    showNotification(`Максимальное количество балок - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
    return;
  }
  
  const newBeam = {
    id: Date.now(),
    marking: "",
    projBeamWidth: "",
    factBeamWidth: "",
    projBeamHeight: "",
    factBeamHeight: "",
    bimAutofilledMark: false,
    bimAutofilledProjBeamWidth: false,
    bimAutofilledProjBeamHeight: false
  };
  
  if (checkGeomBeamDuplicate(newBeam.marking)) {
    showNotification("Балка с такой маркировкой уже существует. Введите другую маркировку.", "warning");
    return;
  }
  
  geomBeams.push(newBeam);
  if (renderCallback) renderCallback();
}

/**
 * Удаляет балку по ID
 * @param {number} id - ID балки
 * @param {Function} renderCallback - Функция для перерисовки списка
 */
export function removeGeomBeam(id, renderCallback) {
  geomBeams = geomBeams.filter(b => b.id !== id);
  if (renderCallback) renderCallback();
}

/**
 * Получает массив балок для геометрии
 * @returns {Array} Массив балок
 */
export function getGeomBeams() {
  return geomBeams;
}

/**
 * Устанавливает массив балок для геометрии
 * @param {Array} newBeams - Новый массив балок
 */
export function setGeomBeams(newBeams) {
  geomBeams = newBeams || [];
}

// ============================
// Вспомогательные функции
// ============================

/**
 * Очищает все данные модуля
 */
export function clearAll() {
  geomColumns = [];
  geomWalls = [];
  geomStairs = [];
  geomBeams = [];
}

/**
 * Очищает данные для указанного типа конструкции
 * @param {string} constructionType - Тип конструкции: "Колонна", "Стена", "Лестница", "Балка"
 */
export function clearByType(constructionType) {
  if (constructionType === "Колонна") {
    geomColumns = [];
  } else if (constructionType === "Стена") {
    geomWalls = [];
  } else if (constructionType === "Лестница") {
    geomStairs = [];
  } else if (constructionType === "Балка") {
    geomBeams = [];
  }
}
