# Клиентский слой

`src/client/app.ts` — браузерный entrypoint и координатор приложения. Новую
feature-логику не следует добавлять в него напрямую.

## Карта каталогов

- `features/` — мигрированные вертикальные функциональные области:
  - `projects/` — выбор объекта, construction selector, design data и runtime;
  - `control-plan/` — UI и use case плана контроля;
  - `journal/` — публичный API данных журнала для других features.
  - `inspections/geodesy/` — DOM bindings, node state/actions, список узлов и
    service boundary над централизованным Firestore repository.
- `app/modules/` — ещё не мигрированные пользовательские разделы. Внутренние
  data/UI файлы конкретного раздела лежат в одноименной подпапке:
  - `geometry/` — состояние и операции геометрического контроля;
  - `reinforcement/` — состояние и операции контроля армирования;
  - `journal/` — работа с записями журнала;
  - `summary/` — итоговое заключение и аналитика.
- `app/services/` — переходный каталог use-case и интеграционных сервисов.
- `app/repositories/` — доступ к Firestore и другим хранилищам.
- `app/profile/` — runtime профиля и статический fallback инфоленты.
- `app/pages/` — TypeScript entrypoints отдельных статических HTML-страниц.
- `app/ui/` — общие DOM-компоненты и UI bindings.
- `app/pdf/` — общая инфраструктура PDF.
- `app/vendor-src/` — исходники собираемых vendor-бандлов.
- `app/vendor/` — только декларации и runtime-контракты vendor-бандлов.
- `index-partials/` — исходные фрагменты для генерации корневого `index.html`.
- `shared/` — небольшие нейтральные модули без зависимостей от features.
- `types/` — общие клиентские типы и ambient declarations.

## Правила размещения

1. Новый feature-код размещается в `features/<feature>/` и экспортирует
   минимальный публичный API из `index.ts`.
2. UI feature вызывает use case/service, а доступ к Firestore выполняется через
   `app/repositories/firestore-repository.ts`.
3. Feature не импортирует внутренний файл другой feature; используется её
   `index.ts` или callback, переданный bootstrap-кодом.
4. `shared/` не зависит от `features/` и не становится складом несвязанных
   helper-функций.
5. `app/modules/` и `app/services/` являются миграционными каталогами: новый
   код туда не добавляется без отдельного обоснования.
6. Корневые `auth.ts`, `firebase.ts`, `config.ts`, `utils.ts`, `sw.ts` и
   `liquid-glass.ts` являются общими entry/support файлами.
7. Новые `globalThis` bridges запрещены. Существующие удаляются только вместе
   с явной заменой всех runtime-потребителей.
8. `dist/**` и корневой `sw.js` генерируются сборкой и вручную не редактируются.

Полные правила и последовательность миграции описаны в корневом
`ARCHITECTURE.md`.
