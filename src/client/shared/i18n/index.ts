import i18next from "i18next";
import { engineering } from "./engineering.js";
import { resources } from "./resources.js";

const engineeringKeys = new Map(Object.entries(engineering.ru).map(([key, value]) => [value as string, key]));
export const translateEngineeringLabel = (label: string) => i18next.resolvedLanguage === "en" && engineeringKeys.has(label) ? t(engineeringKeys.get(label)!) : label;

export const t = (key: string, values: Record<string, unknown> = {}) => String(i18next.isInitialized ? i18next.t(key, values) : resources.ru.translation[key] ?? key);

/** Compatibility for presentation statuses while their domain API migrates to status codes. */
export function translateStatus(status: string) {
  const entry = Object.entries(resources.ru.translation).find(([, label]) => label === status);
  if (entry) return t(entry[0]);
  const issues = status.match(/^Открытых замечаний: (\d+)$/u);
  return issues ? t("openIssuesCount", { count: Number(issues[1]) }) : status;
}

export function renderElementTranslations(root: ParentNode = document) {
  for (const [attribute, target] of [["data-i18n", "textContent"], ["data-i18n-aria", "aria-label"], ["data-i18n-placeholder", "placeholder"], ["data-i18n-title", "title"]]) {
    const elements = [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)];
    if (root instanceof HTMLElement && root.hasAttribute(attribute)) elements.unshift(root);
    for (const element of elements) {
      const label = t(element.getAttribute(attribute)!);
      if (target === "textContent") { if (element.textContent !== label) element.textContent = label; }
      else if (element.getAttribute(target) !== label) element.setAttribute(target, label);
    }
  }
}

function renderTranslations() {
  document.documentElement.lang = i18next.resolvedLanguage || "ru";
  renderElementTranslations();
  document.querySelectorAll<HTMLOptionElement>("#construction option, .section select option").forEach(option => {
    const original = option.dataset.originalLabel || option.textContent || "";
    option.dataset.originalLabel = original;
    if (!option.hasAttribute("value")) option.value = original;
    if (!option.hasAttribute("data-i18n")) option.textContent = translateEngineeringLabel(original);
  });
  const selector = document.getElementById("workspaceLanguage") as HTMLSelectElement | null;
  if (selector) selector.value = i18next.resolvedLanguage || "ru";
  document.dispatchEvent(new CustomEvent("app:language-changed"));
}

export async function initializeLocalization() {
  let language = "ru";
  try { language = localStorage.getItem("workspace_language") === "en" ? "en" : "ru"; } catch { /* Storage may be disabled. */ }
  await i18next.init({ resources, lng: language, fallbackLng: "ru", supportedLngs: ["ru", "en"], interpolation: { escapeValue: false } });
  renderTranslations();
  // Dynamic rows use the same explicit translation attributes as authored forms.
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) renderElementTranslations(node);
  }).observe(document.body, { childList: true, subtree: true });
  document.getElementById("workspaceLanguage")?.addEventListener("change", async event => {
    const language = (event.target as HTMLSelectElement).value === "en" ? "en" : "ru";
    await i18next.changeLanguage(language);
    try { localStorage.setItem("workspace_language", language); } catch { /* Optional preference persistence. */ }
    renderTranslations();
  });
}
