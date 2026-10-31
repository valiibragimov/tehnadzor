# Граница lifecycle workspace

[English](workspace-lifecycle.md)

Исследование этапа 7 от `9427044`, 31 октября 2026. Production `app.ts` создаёт один bridge/context на документ. Навигация и legacy-features используют фиксированные ID всего документа. Поэтому ES module configure-состояние журнала/сводки/геометрии сейчас принадлежит документу, а не независимо монтируемому multi-workspace API.

## Подтверждённое изменение

Повторные вызовы публичного `initNavigation()` одного bridge вызывали две лишние активации и заменяли элементы нижней навигации. Настоящий браузер воспроизвёл `{ activations: 2, sameItem: false }`; после исправления — `{ activations: 0, sameItem: true }`. Состояние инициализации теперь принадлежит closure module runtime, рядом с lazy-promises конкретного workspace. DOM-ready инициализация остаётся отложенной. Синхронная ошибка сбрасывает флаг для повтора. Повторная инициализация по-прежнему обращается к существующему loader вкладки для повтора неудачной lazy-загрузки, без новых обработчиков или активации.

Двадцать две функции bridge только пересылали вызов одноимённому runtime-методу. Теперь это прямые ссылки на функции; inspection-адаптеры, публичные имена действий, defaults и fallback сохранены. Создание runtime выделяет только closures/maps, не импортирует feature-модули и не обращается к DOM. Dynamic imports/configuration остаются в прежних loaders с обработкой ошибок и сбросом promise. Новый registry/framework/global state bridge или кеш URL модулей по workspace не вводился.

## Доказательства и границы

`tests/ui/workspace-lifecycle.test.mjs` использует реальные bridge/runtime и features с существующими синтетическими demo-адаптерами persistence/vendor. Только тестовая instrumentation открывает публичный bridge и считает evaluation модулей. Проверяются повторный init и идентичность DOM; создание bridge без выполнения feature-модулей; одна инициализация при параллельных geometry-actions; fallback при ошибке действия и успешный следующий вызов; два документа одного browser context на разных проектах с независимыми фильтрами журнала и правильным переходом journal→source geometry. Persisted storage намеренно общий, live context/ES module state разделены. Прежние UI-тесты workspace проверяют обычную навигацию, мобильные controls и сохранение форм.

Ошибка действия проверяется непосредственно; transport-level ошибка настоящего dynamic import этим bundled demo fixture не внедряется. Promise reset сохранён по проверке кода, а не объявлен новым сетевым экспериментом.

Два полноценных workspace-context в **одном документе** остаются неподдерживаемыми: общие DOM-ID, legacy configure-state и lifetime обработчиков потребуют per-instance feature factories и явных контрактов DOM/disposal. Сериализация configure или cache-busting import URL не изолировали бы асинхронную работу безопасно и добавили бы риски удержания памяти. Исправление не объявляет такие контексты безопасными и не заменяет состояние журнала/сводки новым registry. Эта часть P3 остаётся открытой до подтверждения реального требования remount/multi-workspace в одном документе. Поддерживаемый сценарий двух окон прошёл и не обосновывает массовую переделку legacy-модулей.
