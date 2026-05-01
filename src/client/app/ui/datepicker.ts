function initDatepickerStyles() {
  // Инжектируем глобальные стили для попапа календаря
  const style = document.createElement("style");
  style.id = "datepicker-custom-styles";
  style.textContent = `
    /* Попытка стилизации попапа календаря через user agent stylesheet */
    /* Нативный datepicker имеет очень ограниченные возможности стилизации из-за shadow DOM */
    
    /* Стили для элементов календаря (работают только если браузер позволяет) */
    input[type="date"] {
      color-scheme: dark;
    }
    
    /* Попытка стилизации через псевдоэлементы (ограниченно) */
    input[type="date"]::-webkit-calendar-picker-indicator {
      cursor: pointer;
      filter: invert(0.8) brightness(1.2);
      opacity: 0.8;
      transition: opacity 0.2s ease;
    }
    
    input[type="date"]::-webkit-calendar-picker-indicator:hover {
      opacity: 1;
      filter: invert(0.9) brightness(1.3);
    }
  `;
  document.head.appendChild(style);

  // Пытаемся инжектировать стили в попап календаря через MutationObserver
  function tryInjectDatepickerStyles() {
    const dateInput = document.getElementById("date");
    if (!dateInput) return;

    // Устанавливаем color-scheme для попапа
    dateInput.style.colorScheme = "dark";

    // Пытаемся найти и стилизовать элементы попапа после открытия
    function attemptStyleInjection() {
      // Попытка найти элементы попапа через различные методы
      // В большинстве браузеров это не работает из-за shadow DOM
      try {
        // Chrome/Edge: попап рендерится в shadow DOM, доступ ограничен
        // Можно попробовать через user agent stylesheet, но это требует расширения браузера

        // Добавляем обработчик для попытки стилизации после открытия
        dateInput.addEventListener(
          "focus",
          function() {
            setTimeout(() => {
              // Попытка найти элементы попапа и применить стили
              // В большинстве браузеров это не работает из-за shadow DOM
              document.querySelectorAll("*");
              // Ищем элементы, которые могут быть частью попапа
              // Это очень ограниченный подход
            }, 100);
          },
          { once: true }
        );
      } catch (e) {
        console.warn("Datepicker styling limited:", e);
      }
    }

    // Запускаем попытку стилизации
    attemptStyleInjection();
  }

  // Запускаем после загрузки DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInjectDatepickerStyles);
  } else {
    tryInjectDatepickerStyles();
  }
}

export { initDatepickerStyles };
