import { showNotification } from "../../utils.js";

function initNetworkStatus() {
  const offlineIndicator = document.getElementById("offlineIndicator");

  const updateOnlineStatus = () => {
    if (!offlineIndicator) return;
    if (navigator.onLine) {
      offlineIndicator.classList.remove("show");
    } else {
      offlineIndicator.classList.add("show");
    }
  };

  window.addEventListener("online", () => {
    updateOnlineStatus();
    showNotification("Подключение восстановлено", "success");
  });

  window.addEventListener("offline", () => {
    updateOnlineStatus();
    showNotification("Нет подключения к сети", "warning");
  });

  // Проверка при загрузке
  updateOnlineStatus();
}

function initDecimalInputNormalization() {
  function normalizeDecimalInput(input) {
    if (!input) return;

    // Нормализуем значение при потере фокуса
    input.addEventListener("blur", function() {
      if (this.value) {
        // Заменяем запятую на точку
        const normalized = this.value.replace(",", ".");
        if (normalized !== this.value) {
          this.value = normalized;
        }
      }
    });

    // Разрешаем ввод запятой и точки
    input.addEventListener("input", function() {
      let value = this.value;
      // Разрешаем только цифры, точку, запятую и минус в начале
      value = value.replace(/[^\d.,-]/g, "");
      // Заменяем множественные точки/запятые на одну
      const parts = value.split(/[.,]/);
      if (parts.length > 2) {
        value = parts[0] + "." + parts.slice(1).join("");
      }
      // Разрешаем только один минус в начале
      if (value.indexOf("-") > 0) {
        value = value.replace(/-/g, "");
      }
      if (value.startsWith("-")) {
        value = "-" + value.substring(1).replace(/-/g, "");
      }
      this.value = value;
    });
  }

  const attach = () => {
    document
      .querySelectorAll('input[inputmode="decimal"]')
      .forEach(normalizeDecimalInput);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
}

function initActionMenus() {
  const setupMenus = () => {
    const menus = Array.from(document.querySelectorAll(".action-menu"));
    if (menus.length === 0) return;

    const closeMenu = menu => {
      const trigger = menu.querySelector(".menu-trigger");
      const panel = menu.querySelector(".menu-panel");
      if (panel) panel.classList.remove("open");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    };

    const closeAllMenus = (exceptMenu = null) => {
      menus.forEach(menu => {
        if (menu !== exceptMenu) closeMenu(menu);
      });
    };

    menus.forEach(menu => {
      const trigger = menu.querySelector(".menu-trigger");
      const panel = menu.querySelector(".menu-panel");
      if (!trigger || !panel) return;

      trigger.addEventListener("click", e => {
        e.stopPropagation();
        const isOpen = panel.classList.contains("open");
        closeAllMenus(menu);
        if (!isOpen) {
          panel.classList.add("open");
          trigger.setAttribute("aria-expanded", "true");
        } else {
          closeMenu(menu);
        }
      });

      panel.addEventListener("click", e => {
        const item = e.target.closest(".menu-item");
        if (!item) return;
        closeMenu(menu);
      });
    });

    document.addEventListener("click", e => {
      if (e.target.closest(".action-menu")) return;
      closeAllMenus();
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeAllMenus();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupMenus);
  } else {
    setupMenus();
  }
}

export { initActionMenus, initDecimalInputNormalization, initNetworkStatus };
