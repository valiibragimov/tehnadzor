# Архитектура Tehnadzor

Дата актуализации: 2026-07-30.

## Контекст и ограничения

Tehnadzor остаётся модульным монолитом на vanilla TypeScript, HTML и CSS.
Firebase Authentication и Firestore остаются инфраструктурой приложения.
Текущие URL, HTML entrypoints, структура данных Firestore, Service Worker,
визуальное оформление и пользовательское поведение являются совместимым
контрактом и не меняются в рамках архитектурной миграции.

В качестве ориентиров используются:

- feature-area grouping и colocation связанных файлов из Angular Style Guide;
- явные ES Modules и изоляция области видимости из TypeScript Handbook;
- направленное ослабление зависимостей из Refactoring Module Dependencies;
- небольшие самостоятельно проверяемые изменения из Google Engineering
  Practices;
- различие между shared-кодом и feature-кодом из Feature-Sliced Design.

Framework-специфичные слои, dependency injection container и новый frontend
framework не вводятся. Зависимости передаются обычными аргументами фабрик и
функций либо импортируются через публичный API feature.

## Фактическое состояние до текущей миграции

Аудит относительных импортов `src/client/**/*.ts` показал:

- 71 исполняемый TypeScript-файл;
- статических циклических импортов не обнаружено;
- `src/client/app.ts` содержит 6 154 строки и импортирует 30 модулей;
- крупнейшие feature-файлы: geometry, knowledge, reinforcement, strength,
  summary и journal;
- часть features уже выделена, но лежит в общей папке `app/modules`;
- repository Firestore централизован в
  `app/repositories/firestore-repository.ts`;
- UI-модули inspections напрямую импортируют repository и Firebase Auth;
- состояние проекта и inspections частично передаётся через `globalThis`;
- `module-bridge.ts` и конец `app.ts` публикуют пересекающиеся глобальные API;
- profile, edit-profile, about и privacy содержат inline JavaScript;
- `utils.ts` содержит более 2 500 строк несвязанных функций;
- control-plan зависит от внутреннего файла summary только ради форматирования
  даты.

Главная проблема не в количестве папок, а в скрытом runtime-контексте:
feature может прочитать `currentProjectId`, коллекцию проверок или callback
другой feature без import и без параметра. Это затрудняет тестирование и
делает порядок инициализации частью неявного контракта.

## Целевая структура

Структура создаётся только для существующего кода:

```text
src/client/
  app.ts                         # bootstrap и wiring
  features/
    auth/
    profile/
    projects/
    inspections/
      geodesy/
      reinforcement/
      geometry/
      strength/
    bim/
    journal/
    control-plan/
    summary/
    knowledge/
  infrastructure/
    firebase/
  shared/
    ui/
    domain/
  app/
    repositories/               # временно сохраняемый центральный repository
```

Не все каталоги создаются заранее. Feature появляется только при переносе
реального кода. На переходном этапе допустимы старые `app/modules` и
`app/services`, если их перемещение затронуло бы несколько независимых
поведений одновременно.

## Правила зависимостей

Разрешённое направление:

```text
HTML entrypoint
  -> app bootstrap
    -> feature public API
      -> feature UI
        -> feature use case/service
          -> repository
            -> Firebase

feature -> shared
infrastructure -> shared
shared -X-> feature
```

Дополнительные правила:

1. Внешний код импортирует feature только через `features/<name>/index.ts`.
2. Внутренние файлы одной feature могут импортировать друг друга напрямую.
3. Feature не импортирует внутренние файлы другой feature. Общение идёт через
   публичный API или callback, переданный bootstrap-кодом.
4. Shared содержит только действительно переиспользуемый код и не зависит от
   features.
5. UI не импортирует Firebase SDK. UI вызывает use case/service; тот обращается
   к repository.
6. Firestore SDK изолируется центральным repository. Прямые обращения,
   оставшиеся в legacy features, являются миграционным долгом.
7. Новые значения не публикуются в `globalThis`. Существующие bridges удаляются
   по одному вместе с явной заменой всех потребителей.
8. `app.ts` создаёт runtime features, передаёт зависимости и запускает
   bindings. Доменные расчёты, запросы, шаблоны и обработчики конкретной
   feature в нём не размещаются.
9. Не создаются общие `utils`, `services` и `types` без единой предметной темы.
10. Публичные HTML и asset paths сохраняются. При необходимости используется
    узкий compatibility entrypoint, а не дублирование реализации.

## Этапы миграции

### Этап A — явный runtime-контекст

- удалить дублирующиеся и неиспользуемые global bridges;
- заменить `globalThis.LS` прямым импортом storage constants;
- добавить regression-проверку, запрещающую возврат этого bridge.

### Этап B — первые вертикальные features

- собрать control-plan рядом: UI, service и публичный API;
- убрать зависимость control-plan от внутренних файлов summary;
- собрать projects рядом: runtime выбора проекта, context/design use cases и
  публичный API;
- сохранить единый Firestore repository.

### Этап C — уменьшение `app.ts`

- вынести construction-selection runtime в projects;
- передавать DOM-зависимости явно при создании runtime;
- оставить в `app.ts` только создание runtime и использование его публичных
  методов;
- geodesy node state/actions и DOM bindings перенесены в vertical feature;
- оставшиеся расчёты геодезической формы и BIM binding переносить отдельными
  поведенчески нейтральными этапами.

### Этап D — HTML entrypoints

- вынести некритичный inline module статических страниц в TypeScript;
- оставить синхронный pre-paint theme bootstrap inline до отдельного этапа
  производительности, поскольку его асинхронный перенос вызывает вспышку темы;
- затем отдельно мигрировать profile и edit-profile с regression-тестами.

### Этап E — repository boundary

- определить use cases для inspections, journal и summary;
- убрать прямые импорты Firebase Auth/Firestore из feature UI;
- передавать идентификатор пользователя и project context через явные
  зависимости;
- после удаления последних consumers сократить `globals.d.ts`.

## Проверка каждого этапа

Каждый самостоятельный этап завершается командами:

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Дополнительно проверяются статические циклы импортов, публичные HTML-пути,
hosting surface и отсутствие новых `globalThis` assignments.

## Осознанно оставленный долг

- дальнейшее деление geometry, reinforcement, knowledge, strength, summary и
  journal выполняется отдельными небольшими изменениями;
- migration Firestore calls из feature UI требует use-case API и не
  совмещается с физическим переносом файлов;
- root `style.css`, bundler, Service Worker и оптимизация загрузки не входят в
  текущую архитектурную фазу;
- ambient declarations удаляются только после удаления соответствующего
  runtime bridge.

## Фактический результат текущей фазы

Выполнено 2026-07-29:

- создана эта архитектурная карта до перемещения production-кода;
- удалён `globalThis.LS`; journal и inspection features используют прямой
  импорт `APP_STORAGE_KEYS`;
- `control-plan` перенесён в `features/control-plan` и получил публичный API;
- общий формат даты вынесен в `shared/date-time.ts`, две дублирующиеся
  реализации удалены;
- `projects` перенесён в `features/projects`: context, design use cases,
  runtime и construction-selection лежат рядом;
- создан минимальный публичный API данных journal для control-plan;
- construction-selection вынесен из `app.ts` с явной передачей DOM elements;
- `app.ts` уменьшен с 6 154 до 5 888 физических строк и с 30 до 28 статических
  относительных импортов;
- inline module privacy вынесен в `app/pages/privacy.ts`; синхронный pre-paint
  theme bootstrap оставлен в HTML для сохранения визуального поведения;
- публичные HTML URL, Firebase data format, Service Worker source и bundler не
  изменены.
- создана vertical feature `features/inspections/geodesy` с небольшим
  публичным `index.ts`;
- DOM bindings, изменяемое состояние формы/BIM selection, node actions и
  rendering списка геодезических узлов находятся рядом с geodesy service;
- оставшаяся логика геодезической формы вынесена из entrypoint:
  `runtime.ts` создаёт и связывает feature, `form.ts` читает, очищает,
  восстанавливает и отображает форму, `evaluation.ts` содержит чистые расчёты
  и journal payload, `handlers.ts` — пользовательские действия, `types.ts` —
  известные структуры данных геодезии;
- `app.ts` сократился до 1 069 строк и для геодезии только создаёт runtime,
  передаёт внешние зависимости и запускает его;
- geodesy UI вызывает service, а Firestore и dual-write доступны только через
  локальный adapter над централизованным repository;
- journal получает geodesy API явно через bootstrap вместо глобальных
  `saveNodes`, `renderNodes`, `loadNode` и current-node bridges;
- BIM/geodesy selection перенесён в `bim-selection.ts` и
  `bim-selection-runtime.ts`: состояние, фильтры, axis hints, DOM rendering,
  восстановление snapshot и ручной режим больше не находятся в entrypoint;
- form и handlers получают один небольшой BIM API вместо набора callback;
- общий IFC import runtime, BIM visual panel и That Open pipeline остались в
  общих app services и передаются feature явно;
- публичный `geodesy/index.ts` сокращён до четырёх production entrypoints;
- добавлены поведенческие тесты service, node actions и BIM selection.
- создан первый vertical slice `features/inspections/strength`: типы,
  `StrengthState`, чистые нормативные расчёты, service/use-case boundary и
  Firestore adapter находятся рядом с feature;
- форма прочности, её DOM bindings, пользовательские действия, journal payload
  и управление Chart.js перенесены в `dom.ts`, `form.ts`, `handlers.ts`,
  `chart.ts` и связываются в `runtime.ts`;
- strength-specific BIM selection разделён на чистый
  `bim-selection.ts` и DOM/runtime `bim-selection-runtime.ts`; feature runtime
  получает один небольшой BIM API;
- legacy `app/modules/strength.ts` оставлен 138-строчным compatibility
  entrypoint: он только связывает зависимости и сохраняет старые module bridge
  exports;
- `strengthChecks` и `currentStrengthCheckId` больше не публикуются и не
  читаются через `globalThis`; journal, overview и summary получают strength
  state через небольшие callback API;
- source collection `strengthChecks`, формат документов и dual-write в
  `inspections` сохранены.
- создан первый vertical slice `features/inspections/reinforcement`: feature
  владеет типами, `ReinforcementState`, чистыми расчётами и service/repository
  boundary;
- коллекция `reinfChecks`, текущий ID и строки колонн, балок и стен теперь
  принадлежат одному явно переданному state; старый `reinforcement/data.ts`
  оставлен только как stateless build-path compatibility adapter;
- сохранение `reinfChecks`, soft-delete filtering и dual-write в `inspections`
  выполняются через локальный Firestore adapter над централизованным
  repository;
- `globalThis.reinfChecks` и `globalThis.currentReinfCheckId` удалены;
  journal, overview и summary получают reinforcement state через небольшие
  публичные API;
- reinforcement DOM bindings, управление формой, строки колонн/балок/стен,
  пользовательские действия, rendering проверок и orchestration перенесены в
  `dom.ts`, `form.ts`, `rows-runtime.ts` и `runtime.ts`;
- `app/modules/reinforcement.ts` теперь является compatibility entrypoint:
  он конфигурирует feature runtime и временно содержит только
  reinforcement-specific BIM selection/visual panel integration.

Повторный аудит после миграции:

- 115 клиентских TypeScript-файлов;
- 0 статических циклов импортов;
- 0 обращений к `globalThis.LS`;
- 104 smoke/regression-теста;
- все этапы отдельно прошли typecheck, lint, build и test.

Оставшиеся наиболее важные зависимости:

1. Geometry UI всё ещё напрямую использует repository/Firebase runtime;
   geodesy, strength и storage-операции reinforcement уже обращаются к данным
   через локальные service boundaries.
2. `globalThis` всё ещё используется как legacy runtime context; новых bridges
   в текущей фазе не добавлено.
3. Inline modules остаются в about, profile и edit-profile; их перенос требует
   отдельных page-level regression-тестов.
4. Journal public API пока является compatibility boundary над старым
   `app/modules/journal/data.ts`; реализацию следует переносить вместе со всей
   feature, а не дублировать.
5. `form.ts`, `handlers.ts` и `bim-selection-runtime.ts` пока крупные из-за
   объёма существующей DOM-формы и BIM binding UI.
   Дальнейшее деление допустимо только по подтверждённым поведенческим границам,
   а не ради уменьшения размера файлов.
6. Strength vertical slice завершён на текущей границе: общий IFC import,
   `bim-elements`, visual panel и That Open pipeline остаются shared app
   services и не дублируются внутри feature.
7. Reinforcement vertical slice включает state, evaluation, storage, форму,
   DOM actions и rendering. Следующим отдельным этапом остаётся только перенос
   reinforcement-specific BIM selection из compatibility entrypoint.
