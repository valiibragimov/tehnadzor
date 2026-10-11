import { setGlobalScrollLock } from "../../utils.js";

const STORAGE_KEY = "app_theme";
const SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>`;

function normalizeTheme(theme) {
  return theme === "light" ? "light" : "dark";
}

function getSavedTheme() {
  return normalizeTheme(localStorage.getItem(STORAGE_KEY) || "light");
}

function setThemeClasses(theme) {
  const isLight = theme === "light";

  document.documentElement.classList.toggle("theme-light", isLight);
  document.documentElement.classList.toggle("theme-dark", !isLight);

  if (!document.body) return;
  document.body.classList.toggle("theme-light", isLight);
  document.body.classList.toggle("theme-dark", !isLight);
}

function syncThemeRadio(theme) {
  const radio = document.querySelector(`input[name="theme"][value="${theme}"]`);
  if (radio) {
    radio.checked = true;
  }
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  const isLight = normalizedTheme === "light";
  const btn = document.getElementById("themeToggleBtn");
  const icon = btn ? btn.querySelector(".theme-toggle-icon") : null;

  setThemeClasses(normalizedTheme);
  syncThemeRadio(normalizedTheme);

  if (!icon) return;

  icon.innerHTML = isLight ? SUN : MOON;
}

function initThemeControls() {
  const btn = document.getElementById("themeToggleBtn");
  const savedTheme = getSavedTheme();

  applyTheme(savedTheme);
  localStorage.setItem(STORAGE_KEY, savedTheme);

  if (btn) {
    btn.addEventListener("click", () => {
      const currentlyLight = document.body.classList.contains("theme-light");
      const nextTheme = currentlyLight ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  }

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener("change", () => {
      const nextTheme = normalizeTheme(input.value);
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  });
}

function initSettingsPanel() {
  const btnSettings = document.getElementById("btnSettings");
  const panel = document.getElementById("settingsPanel");
  const backdrop = document.getElementById("settingsBackdrop");
  const btnClose = document.getElementById("btnSettingsClose");

  if (!btnSettings || !panel || !backdrop || !btnClose) return;
  let isOpen = false;

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    panel.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    setGlobalScrollLock(true);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.add("hidden");
    backdrop.classList.add("hidden");
    setGlobalScrollLock(false);
  };

  btnSettings.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  backdrop.addEventListener("click", close);
}

export { applyTheme, initSettingsPanel, initThemeControls };
