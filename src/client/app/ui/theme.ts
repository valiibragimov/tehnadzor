import { setGlobalScrollLock } from "../../utils.js";

const STORAGE_KEY = "app_theme";
const SUN = "☀️";
const MOON = "🌙";

function normalizeTheme(theme) {
  return theme === "light" ? "light" : "dark";
}

function getSavedTheme() {
  return normalizeTheme(localStorage.getItem(STORAGE_KEY) || "dark");
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

function applyTheme(theme, animate = false) {
  const normalizedTheme = normalizeTheme(theme);
  const isLight = normalizedTheme === "light";
  const btn = document.getElementById("themeToggleBtn");
  const icon = btn ? btn.querySelector(".theme-toggle-icon") : null;

  setThemeClasses(normalizedTheme);
  syncThemeRadio(normalizedTheme);

  if (!icon) return;

  if (!animate) {
    icon.textContent = isLight ? SUN : MOON;
    return;
  }

  btn.classList.add("animating");

  setTimeout(() => {
    icon.textContent = isLight ? SUN : MOON;
  }, 200);

  btn.addEventListener(
    "animationend",
    () => {
      btn.classList.remove("animating");
    },
    { once: true }
  );
}

function initThemeControls() {
  const btn = document.getElementById("themeToggleBtn");
  const savedTheme = getSavedTheme();

  applyTheme(savedTheme, false);
  localStorage.setItem(STORAGE_KEY, savedTheme);

  if (btn) {
    btn.addEventListener("click", () => {
      const currentlyLight = document.body.classList.contains("theme-light");
      const nextTheme = currentlyLight ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme, false);
    });
  }

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener("change", () => {
      const nextTheme = normalizeTheme(input.value);
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme, false);
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
