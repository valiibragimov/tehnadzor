import i18next from "i18next";
import { resources } from "./resources.js";

export const t = (key: string, values: Record<string, unknown> = {}) => String(i18next.t(key, values));

/** Compatibility for presentation statuses while their domain API migrates to status codes. */
export function translateStatus(status: string) {
  const entry = Object.entries(resources.ru.translation).find(([, label]) => label === status);
  if (entry) return t(entry[0]);
  const issues = status.match(/^Открытых замечаний: (\d+)$/u);
  return issues ? t("openIssuesCount", { count: Number(issues[1]) }) : status;
}

function renderTranslations() {
  document.documentElement.lang = i18next.resolvedLanguage || "ru";
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach(element => {
    element.textContent = t(element.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach(element => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria!));
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder!);
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
  document.getElementById("workspaceLanguage")?.addEventListener("change", async event => {
    const language = (event.target as HTMLSelectElement).value === "en" ? "en" : "ru";
    await i18next.changeLanguage(language);
    try { localStorage.setItem("workspace_language", language); } catch { /* Optional preference persistence. */ }
    renderTranslations();
  });
}
