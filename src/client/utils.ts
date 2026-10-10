import { t } from "./shared/i18n/index.js";
import { VALID_LETTER_AXES } from "./config.js";
import {
  getConstructionModuleBehavior,
  getConstructionProfile
} from "./app/construction.js";

interface SingleFlightOptions<T> {
  onDedupe?: (promise: Promise<T>) => void;
}

interface ButtonBusyStateOptions {
  defaultLabel?: string;
  busyLabel?: string;
}

function getConstructionDomState() {
  const construction = document.getElementById("construction");
  const constructionValue = construction?.dataset?.machineValue || (construction ? construction.value : "");
  const constructionSubtype = construction?.dataset?.subtypeKey || "";
  return {
    construction,
    constructionValue,
    constructionSubtype
  };
}

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeHtml(inputHtml) {
  const html = inputHtml == null ? "" : String(inputHtml);
  const template = document.createElement("template");
  template.innerHTML = html;

  const allowedTags = new Set([
    "A", "B", "STRONG", "I", "EM", "U",
    "P", "BR", "UL", "OL", "LI",
    "H1", "H2", "H3", "H4",
    "BLOCKQUOTE", "CODE", "PRE", "SPAN", "DIV", "SMALL"
  ]);
  const allowedAttrs = {
    A: new Set(["href", "target", "rel"])
  };
  const globalAttrs = new Set(["class", "id", "style"]);

  const nodes = Array.from(template.content.querySelectorAll("*"));
  nodes.forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ""));
      return;
    }
    Array.from(node.attributes).forEach((attr) => {
      const isGlobal = globalAttrs.has(attr.name);
      const isAllowed = isGlobal || allowedAttrs[node.tagName]?.has(attr.name);
      if (!isAllowed) {
        node.removeAttribute(attr.name);
        return;
      }
      if (attr.name === "style") {
        const value = attr.value || "";
        if (/expression\s*\(/i.test(value) || /url\(\s*['"]?\s*javascript:/i.test(value)) {
          node.removeAttribute("style");
        }
      }
      if (node.tagName === "A" && attr.name === "href") {
        const href = attr.value || "";
        const ok = /^(https?:|mailto:|tel:|#|\/|\.)/i.test(href);
        if (!ok) {
          node.removeAttribute("href");
        }
      }
      if (node.tagName === "A" && attr.name === "target") {
        if (attr.value === "_blank") {
          node.setAttribute("rel", "noopener noreferrer");
        }
      }
    });
  });

  return template.innerHTML;
}

export function selfTestEscapeHtml() {
  const payload = "</b><img src=x onerror=alert(1)>";
  const encoded = escapeHtml(payload);
  const div = document.createElement("div");
  div.innerHTML = encoded;
  return div.textContent === payload && !div.querySelector("img");
}

// ============================
//  Вспомогательные функции
// ============================

export function showNotification(message, type = "info", duration = 3000) {
  const safeMessage = message == null ? "" : String(message);
  let container = document.getElementById("notification-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "notification-container";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }

  const notification = document.createElement("div");
  notification.style.cssText = `
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    color: white;
    font-weight: 500;
    min-width: 300px;
    max-width: 500px;
    animation: slideIn 0.3s ease-out;
    cursor: pointer;
  `;

  const colors = {
    success: { bg: "#10b981", border: "#059669" },
    error: { bg: "#ef4444", border: "#dc2626" },
    warning: { bg: "#f59e0b", border: "#d97706" },
    info: { bg: "#3b82f6", border: "#2563eb" }
  };

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ"
  };

  const color = colors[type] || colors.info;
  notification.style.backgroundColor = color.bg;
  notification.style.borderLeft = `4px solid ${color.border}`;
  notification.textContent = `${icons[type] || ""} ${safeMessage}`.trim();

  container.appendChild(notification);

  const removeNotification = () => {
    notification.style.animation = "slideOut 0.3s ease-in";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  };

  setTimeout(removeNotification, duration);
  notification.addEventListener("click", removeNotification);
}

if (!document.getElementById("notification-styles")) {
  const style = document.createElement("style");
  style.id = "notification-styles";
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

const singleFlightOperations = new Map();

export function runSingleFlight<T>(
  key,
  operation: () => Promise<T> | T,
  options: SingleFlightOptions<T> = {}
) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return Promise.reject(new Error("Single-flight key is required."));
  }

  const existing = singleFlightOperations.get(normalizedKey);
  if (existing) {
    if (typeof options.onDedupe === "function") {
      options.onDedupe(existing.promise);
    }
    return existing.promise;
  }

  const promise = Promise.resolve().then(operation).finally(() => {
    const current = singleFlightOperations.get(normalizedKey);
    if (current?.promise === promise) {
      singleFlightOperations.delete(normalizedKey);
    }
  });

  singleFlightOperations.set(normalizedKey, {
    promise,
    startedAt: Date.now()
  });

  return promise;
}

export function isSingleFlightActive(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;
  return singleFlightOperations.has(normalizedKey);
}

export function setButtonBusyState(
  button,
  isBusy,
  options: ButtonBusyStateOptions = {}
) {
  if (!(button instanceof HTMLElement)) return;

  const labelEl = button.querySelector(".lg-btn__label");
  const textTarget = labelEl || button;
  const defaultLabel = String(
    (textTarget.getAttribute("data-i18n") ? t(textTarget.getAttribute("data-i18n")) : "") ||
    options.defaultLabel ||
    button.dataset.defaultLabel ||
    textTarget.textContent ||
    ""
  ).trim();

  if (defaultLabel) {
    button.dataset.defaultLabel = defaultLabel;
  }

  if (isBusy) {
    if (!button.dataset.busyPrevDisabled) {
      button.dataset.busyPrevDisabled = button.disabled ? "1" : "0";
    }
    button.disabled = true;
    button.classList.add("is-busy");
    button.setAttribute("aria-busy", "true");
    const busyLabel = String(options.busyLabel || defaultLabel || "").trim();
    if (busyLabel) {
      textTarget.textContent = busyLabel;
    }
    return;
  }

  const wasDisabled = button.dataset.busyPrevDisabled === "1";
  delete button.dataset.busyPrevDisabled;
  button.disabled = wasDisabled;
  button.classList.remove("is-busy");
  button.removeAttribute("aria-busy");
  if (defaultLabel) {
    textTarget.textContent = defaultLabel;
  }
}

export function debounce(callback, waitMs = 180) {
  let timeoutId = null;
  let lastArgs = [];
  let lastThis = null;

  const debounced = function (...args) {
    lastArgs = args;
    lastThis = this;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback.apply(lastThis, lastArgs);
    }, Math.max(0, Number(waitMs) || 0));
  };

  debounced.cancel = () => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };

  debounced.flush = () => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
    callback.apply(lastThis, lastArgs);
  };

  return debounced;
}

/**
 * Проверяет, является ли значение допустимой буквенной осью
 * @param {string} value - Значение для проверки
 * @returns {boolean} - true если значение является допустимой буквенной осью
 */
export function isValidLetterAxis(value) {
  if (!value || typeof value !== "string") return false;
  const normalized = value.trim().toUpperCase();
  return VALID_LETTER_AXES.includes(normalized);
}

/**
 * Проверяет, является ли значение допустимой цифровой осью
 * @param {string|number} value - Значение для проверки
 * @returns {boolean} - true если значение является допустимой цифровой осью
 */
export function isValidNumberAxis(value) {
  if (value === null || value === undefined) return false;
  const str = String(value).trim();
  if (!str) return false;
  // Проверяем, что значение - это число (может быть с десятичной частью)
  return /^\d+(\.\d+)?$/.test(str);
}

/**
 * Нормализует маркировку конструкции (удаляет лишние пробелы, приводит к одному формату)
 * @param {string} marking - Маркировка для нормализации
 * @returns {string} - Нормализованная маркировка
 */
export function normalizeMarking(marking) {
  if (!marking || typeof marking !== 'string') return "";
  return marking.trim().replace(/\s+/g, " ");
}

/**
 * Приводит часть строки к безопасному формату для Firestore docId
 * @param {string|number|null|undefined} value - Значение для нормализации
 * @param {number} maxLength - Максимальная длина результата
 * @returns {string} - Безопасная строка
 */
export function toDocIdPart(value, maxLength = 120) {
  const raw = value == null ? "" : String(value);
  let cleaned = raw.replace(/[\/\\#?\[\]]/g, "_");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return cleaned;
}

/**
 * Форматирует число с округлением до 1 знака после запятой
 * @param {number|string|null|undefined} value - Значение для форматирования
 * @returns {string} - Форматированное значение или "—" если значение недопустимо
 */
export function formatNumber(value) {
  if (value === null || value === undefined || value === "" || isNaN(Number(value))) {
    return "—";
  }
  const num = Number(value);
  if (isNaN(num)) return "—";
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(1);
}

/**
 * Парсит строку в число, поддерживая запятую как десятичный разделитель
 * @param {string|number|null|undefined} value - Значение для парсинга
 * @returns {number|null} - Число или null если значение не может быть преобразовано
 */
export function parseDecimal(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  
  const str = String(value).trim().replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Проверяет, превышает ли отклонение допуск
 * @param {number} actual - Фактическое значение (или отклонение при двух аргументах)
 * @param {number} project - Проектное значение (или допуск при двух аргументах)
 * @param {number} tolerance - Допуск
 * @returns {Object} - { ok: boolean, dev: number }
 */
export function checkTolerance(actual, project, tolerance) {
  if (actual == null || project == null) {
    return { ok: false, dev: 0 };
  }

  // Поддержка старой сигнатуры: checkTolerance(deviation, tolerance)
  if (tolerance === undefined) {
    const absDev = Math.abs(actual);
    return {
      ok: absDev <= project,
      dev: absDev
    };
  }

  const dev = Math.abs(actual - project);
  return {
    ok: dev <= tolerance,
    dev
  };
}

/**
 * Проверяет строгое соответствие (для параметров, где отклонение не допускается)
 * @param {number} actual - Фактическое значение
 * @param {number} project - Проектное значение
 * @returns {Object} - { ok: boolean, dev: number }
 */
export function checkStrictMatch(actual, project) {
  const dev = Math.abs(actual - project);
  return {
    ok: dev === 0,
    dev: dev
  };
}

/**
 * Проверяет, заполнено ли хотя бы одно из значений
 * @param {...any} values - Значения для проверки
 * @returns {boolean} - true если хотя бы одно значение заполнено
 */
export function hasAnyFilled(...values) {
  return values.some(val => val !== null && val !== undefined && val !== "");
}

/**
 * Проверяет, заполнены ли все значения
 * @param {...any} values - Значения для проверки
 * @returns {boolean} - true если все значения заполнены
 */
export function hasAllFilled(...values) {
  return values.every(val => val !== null && val !== undefined && val !== "");
}

/**
 * Проверяет, является ли строка пустой или содержит только пробелы
 * @param {string} str - Строка для проверки
 * @returns {boolean} - true если строка пустая или содержит только пробелы
 */
export function isEmptyOrWhitespace(str) {
  return !str || typeof str !== 'string' || str.trim() === '';
}

/**
 * Форматирует результат проверки параметра
 * @param {Object} params - Параметры результата
 * @param {string} params.parameterName - Название параметра
 * @param {number} params.actual - Фактическое значение
 * @param {number} params.project - Проектное значение
 * @param {number|null} params.tolerance - Допуск (null для строгого соответствия)
 * @param {string} params.unit - Единица измерения
 * @param {string} params.regulatoryDoc - Нормативный документ
 * @param {boolean} params.isStrict - Является ли параметр строго соответствующим
 * @returns {string} - HTML-строка с результатом проверки
 */
export function formatCheckResult({ parameterName, actual, project, tolerance, unit, regulatoryDoc, isStrict }) {
  const safeParam = escapeHtml(parameterName);
  const safeUnit = escapeHtml(unit);
  if (project === null || project === undefined || project === "") {
    return `<div>${safeParam}: проектное значение не заполнено</div>`;
  }
  
  if (actual === null || actual === undefined || actual === "") {
    return `<div>${safeParam}: фактическое значение не заполнено</div>`;
  }
  
  const dev = Math.abs(actual - project);
  const isOk = isStrict ? (dev === 0) : (dev <= (tolerance || 0));
  const status = isOk ? "в норме" : "превышено";
  const statusClass = isOk ? "ok" : "not-ok";
  
  let toleranceText = "";
  if (isStrict) {
    toleranceText = "(строгое соотв.)";
  } else if (tolerance != null) {
    toleranceText = `(допуск ±${escapeHtml(tolerance)} ${safeUnit})`;
  }
  
  return `
    <div class="check-result ${statusClass}">
      <div><strong>${safeParam}:</strong></div>
      <div>проект: ${escapeHtml(formatNumber(project))} ${safeUnit}, факт: ${escapeHtml(formatNumber(actual))} ${safeUnit} ${toleranceText} — <span class="${statusClass}">${status}</span>
      ${!isOk ? `<div style="color: #ef4444; margin-top: 2px;">отклонение: ${escapeHtml(dev.toFixed(1))} ${safeUnit}</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Проверяет, является ли текущий проект валидным
 * @param {string|null} projectId - ID проекта
 * @returns {boolean} - true если проект валиден
 */
export function validateProject(projectId) {
  if (!projectId || projectId.trim() === "") {
    showNotification("Сначала создайте объект или выберите существующий.", "warning");
    return false;
  }
  return true;
}

/**
 * Проверяет, заполнено ли обязательное поле
 * @param {HTMLElement} field - Поле для проверки
 * @param {string} fieldName - Название поля для уведомления
 * @returns {boolean} - true если поле заполнено
 */
export function validateRequiredField(field, fieldName) {
  if (!field) return true; // Если поля нет, считаем, что проверка пройдена
  
  const value = field.value?.trim();
  if (!value) {
    showNotification(`Поле '${fieldName}' обязательно для заполнения.`, "error");
    field.focus();
    return false;
  }
  return true;
}

/**
 * Проверяет, что буквенные оси не равны друг другу
 * @param {string} axis1 - Первая буквенная ось
 * @param {string} axis2 - Вторая буквенная ось
 * @returns {boolean} - true если оси различаются
 */
export function validateAxesNotEqual(axis1, axis2) {
  if (axis1 && axis2 && axis1 === axis2) {
    showNotification("Оси не должны повторяться. Выберите разные оси.", "error");
    return false;
  }
  return true;
}

let activeConfirmPopover: HTMLDivElement | null = null;
let activeConfirmPopoverClose: ((result: boolean) => void) | null = null;
let globalScrollLockCount = 0;
let globalScrollLockY = 0;

export function setGlobalScrollLock(locked: boolean) {
  const html = document.documentElement;
  const body = document.body;
  if (!html || !body) return;

  if (locked) {
    globalScrollLockCount += 1;
    if (globalScrollLockCount > 1) return;

    globalScrollLockY = window.scrollY || window.pageYOffset || 0;
    body.style.top = `-${globalScrollLockY}px`;
    body.style.width = "100%";
    html.classList.add("scope-scroll-locked");
    body.classList.add("scope-scroll-locked");
    return;
  }

  globalScrollLockCount = Math.max(0, globalScrollLockCount - 1);
  if (globalScrollLockCount > 0) return;

  html.classList.remove("scope-scroll-locked");
  body.classList.remove("scope-scroll-locked");
  body.style.top = "";
  body.style.width = "";
  window.scrollTo(0, globalScrollLockY);
  globalScrollLockY = 0;
}

function resolveConfirmAnchor(anchor?: HTMLElement | null) {
  if (anchor instanceof HTMLElement) {
    return anchor;
  }

  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function positionConfirmPopover(popover: HTMLDivElement, anchor: HTMLElement | null) {
  const viewportPadding = 12;

  if (!(anchor instanceof HTMLElement) || !anchor.isConnected) {
    const rect = popover.getBoundingClientRect();
    const left = Math.max(viewportPadding, (window.innerWidth - rect.width) / 2);
    const top = Math.max(viewportPadding, (window.innerHeight - rect.height) / 2);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const offset = 10;

  let left = anchorRect.right + offset;
  let top = anchorRect.top + (anchorRect.height - popoverRect.height) / 2;

  if (left + popoverRect.width > window.innerWidth - viewportPadding) {
    left = anchorRect.left - popoverRect.width - offset;
  }

  if (left < viewportPadding) {
    left = anchorRect.left + (anchorRect.width - popoverRect.width) / 2;
  }

  if (left < viewportPadding) {
    left = viewportPadding;
  }

  if (left + popoverRect.width > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, window.innerWidth - popoverRect.width - viewportPadding);
  }

  if (top < viewportPadding) {
    top = viewportPadding;
  }

  if (top + popoverRect.height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

/**
 * Показывает компактное подтверждение рядом с кнопкой удаления
 * @param {string} message - Сообщение для подтверждения
 * @param {{ anchor?: HTMLElement | null }} options
 * @returns {Promise<boolean>} - true если пользователь подтвердил
 */
export async function showConfirm(message, options: { anchor?: HTMLElement | null } = {}) {
  return new Promise<boolean>((resolve) => {
    activeConfirmPopoverClose?.(false);

    const anchor = resolveConfirmAnchor(options.anchor);
    const popover = document.createElement("div");
    popover.className = "confirm-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "false");
    popover.setAttribute("aria-label", message || "Удалить проверку?");
    popover.innerHTML = `
      <div class="confirm-popover__title">Удалить проверку?</div>
      <div class="confirm-popover__actions">
        <button type="button" class="confirm-popover__button btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-confirm-action="cancel">
          <span class="lg-btn__label">Отмена</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
        <button type="button" class="confirm-popover__button confirm-popover__button--primary btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-confirm-action="confirm">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
    `;

    const confirmButton = popover.querySelector('[data-confirm-action="confirm"]');
    const cancelButton = popover.querySelector('[data-confirm-action="cancel"]');

    if (!(confirmButton instanceof HTMLButtonElement) || !(cancelButton instanceof HTMLButtonElement)) {
      resolve(false);
      return;
    }
    document.body.appendChild(popover);

    let isClosed = false;

    const closePopover = (result: boolean) => {
      if (isClosed) return;
      isClosed = true;

      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);

      if (activeConfirmPopover === popover) {
        activeConfirmPopover = null;
        activeConfirmPopoverClose = null;
      }

      if (popover.isConnected) {
        popover.remove();
      }

      if (anchor instanceof HTMLElement && anchor.isConnected) {
        anchor.focus();
      }

      resolve(result);
    };

    const updatePosition = () => {
      if (!popover.isConnected) return;
      positionConfirmPopover(popover, anchor);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popover.contains(target)) return;
      if (anchor instanceof HTMLElement && anchor.contains(target)) return;
      closePopover(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePopover(false);
    };

    confirmButton.addEventListener("click", () => closePopover(true));
    cancelButton.addEventListener("click", () => closePopover(false));

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    activeConfirmPopover = popover;
    activeConfirmPopoverClose = closePopover;

    requestAnimationFrame(() => {
      updatePosition();
      confirmButton.focus();
    });
  });
}

/**
 * Показывает алерт
 * @param {string} message - Сообщение для отображения
 * @returns {Promise<void>}
 */
export async function showAlert(message, title = "Информация") {
  return new Promise<void>((resolve) => {
    setGlobalScrollLock(true);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
        </div>
        <div class="modal-body">
          <p class="modal-message"></p>
        </div>
        <div class="modal-footer">
          <button id="alertOk" class="btn-primary">OK</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector(".modal-title").textContent = title ?? "Информация";
    modal.querySelector(".modal-message").textContent = message ?? "";
    
    const okBtn = document.getElementById('alertOk');
    let closed = false;
    
    const closeAlert = () => {
      if (closed) return;
      closed = true;
      document.body.removeChild(modal);
      setGlobalScrollLock(false);
      resolve();
    };

    okBtn.addEventListener('click', closeAlert);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeAlert();
      }
    });
  });
}

/**
 * Показывает промпт для ввода
 * @param {string} message - Сообщение для отображения
 * @param {string} defaultValue - Значение по умолчанию
 * @param {string} title - Заголовок окна
 * @returns {Promise<string|null>} - Введенное значение или null если отменено
 */
export async function showPrompt(message, defaultValue = "", title = "Ввод") {
  return new Promise((resolve) => {
    setGlobalScrollLock(true);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
        </div>
        <div class="modal-body">
          <p class="modal-message"></p>
          <input type="text" id="promptInput" style="width: 100%; padding: 8px; margin: 8px 0;" />
        </div>
        <div class="modal-footer">
          <button id="promptOk" class="btn-primary">OK</button>
          <button id="promptCancel" class="btn-secondary">Отмена</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector(".modal-title").textContent = title ?? "Ввод";
    modal.querySelector(".modal-message").textContent = message ?? "";
    
    const input = document.getElementById('promptInput');
    input.value = defaultValue ?? "";
    const okBtn = document.getElementById('promptOk');
    const cancelBtn = document.getElementById('promptCancel');
    let closed = false;
    
    const closePrompt = (result) => {
      if (closed) return;
      closed = true;
      document.body.removeChild(modal);
      setGlobalScrollLock(false);
      resolve(result);
    };
    
    okBtn.addEventListener('click', () => closePrompt(input.value.trim()));
    cancelBtn.addEventListener('click', () => closePrompt(null));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePrompt(null);
    });
    
    // Фокус на поле ввода
    setTimeout(() => input.focus(), 100);
    
    // Enter для подтверждения
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        closePrompt(input.value.trim());
      }
    });
  });
}

/**
 * Проверяет, соответствует ли значение проектному с учетом допуска
 * @param {number} actual - Фактическое значение
 * @param {number} project - Проектное значение
 * @param {number} tolerance - Допуск
 * @returns {Object} - { ok: boolean, dev: number, status: string }
 */
export function checkToleranceWithStatus(actual, project, tolerance) {
  if (project == null || actual == null) {
    return { ok: false, dev: 0, status: "empty" };
  }
  
  const dev = Math.abs(actual - project);
  const ok = dev <= tolerance;
  return {
    ok,
    dev,
    status: ok ? "ok" : "exceeded"
  };
}

/**
 * Форматирует дату в формате DD.MM.YYYY
 * @param {Date|string|number} date - Дата
 * @returns {string} - Отформатированная дата
 */
export function formatDate(date) {
  if (!date) return "—";
  
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "—";
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Генерирует местоположение на основе осей
 * @param {string} letterFrom - Первая буквенная ось
 * @param {string} letterTo - Вторая буквенная ось
 * @param {string} numberFrom - Первая цифровая ось
 * @param {string} numberTo - Вторая цифровая ось
 * @returns {string} - Сгенерированное местоположение
 */
export function generateLocation(letterFrom, letterTo, numberFrom, numberTo) {
  const letters = letterFrom && letterTo ? `${letterFrom}-${letterTo}` : (letterFrom || letterTo || "");
  const numbers = numberFrom && numberTo ? `${numberFrom}-${numberTo}` : (numberFrom || numberTo || "");
  
  if (letters && numbers) {
    return `${letters}, ${numbers}`;
  }
  return letters || numbers || "";
}

/**
 * Форматирует значение для отображения в узлах
 * @param {any} value - Значение
 * @param {string} unit - Единица измерения
 * @returns {string} - Отформатированное значение
 */
export function formatNodeValue(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "—";
  // Округляем до 1 знака после запятой, но убираем .0 если это целое число
  const rounded = Math.round(num * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return formatted + (unit ? ` ${unit}` : "");
}

/**
 * Возвращает русские буквенные оси по умолчанию
 */
export const defaultRusLetters = [...VALID_LETTER_AXES];

/**
 * Возвращает цифровые оси по умолчанию
 */
export const MAX_AXIS_NUMBER = 50;
export const defaultNumbers = Array.from({length: MAX_AXIS_NUMBER}, (_, i) => (i + 1).toString());

/**
 * Форматирует статус для отображения
 * @param {string} status - Статус ("ok", "exceeded", "empty", "pending")
 * @returns {string} - Отформатированный статус
 */
export function formatStatus(status) {
  switch(status) {
    case "ok":
      return "в норме";
    case "exceeded":
      return "превышено";
    case "empty":
      return "не заполнено";
    case "pending":
      return "ожидает";
    default:
      return status;
  }
}
