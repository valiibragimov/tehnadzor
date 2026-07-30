# REFACTOR_AUDIT

Актуальная заметка по структуре репозитория, build artifacts и безопасным границам рефакторинга.

## 1. Общая карта проекта

Актуальная структура после аудита и рефакторинга:

- `src/client` — канонический клиентский TypeScript-слой.
- `src/shared` — канонический shared-слой для общей логики server/functions.
- `server/src` — канонический код локального Node/Express API.
- `functions/src` — канонический код Firebase Functions.
- `scripts` — build/maintenance scripts.
- `tests/smoke` — минимальные smoke/regression-тесты.
- `tools/viewer-harness` — dev-only BIM harness.
- `docs` — документация.
- корневые `*.html`, `style.css`, `liquid-glass.css`, `fonts`, `icons` — deployable static surface.

Что убрано из рабочего дерева:

- `node_modules`
- `server/node_modules`
- `functions/node_modules`
- `dist`
- `server/dist`
- `functions/dist`
- `.firebase`
- `tmp-chrome-*`
- `server/serviceAccount.json`

## 2. Какие папки являются реальными исходниками

Источник истины:

- `src/client/**`
- `src/shared/**`
- `server/src/**`
- `functions/src/**`
- `scripts/**`
- `tests/smoke/**`
- `tools/viewer-harness/**` — только как dev-tool source

Дополнительно:

- `src/client/index-partials/**` — source of truth для `index.html`.
- `src/client/sw.ts` — source of truth для корневого `sw.js`.
- `src/client/modules/summary/**` — source of truth для summary block assets.

## 3. Какие папки являются build/runtime artifacts

Build/runtime artifacts:

- `dist/**`
- `server/dist/**`
- `functions/dist/**`
- `node_modules/**`
- `server/node_modules/**`
- `functions/node_modules/**`
- `.firebase/**`
- `tmp-chrome-*`
- корневой `sw.js`

Статус:

- артефакты подтверждены конфигами `tsconfig.*` и build-скриптами;
- правила их игнора обновлены;
- локальные копии удалены из рабочего дерева после успешной верификации.

## 4. Какие файлы и папки выглядят как мусор или временные артефакты

Удалено фактически:

- все `tmp-chrome-*`
- `.firebase`
- локальные `node_modules`
- локальные build-output каталоги

Оставлено намеренно:

- `tools/viewer-harness/assets/cottage.ifc`

Причина:

- это большой dev-asset для BIM harness, не временный файл и не build-мусор.

## 5. Какие JS-файлы дублируют TS-слой

Подтвержденные generated JS-копии TS-слоя:

- `dist/app.js` ← `src/client/app.ts`
- `dist/auth.js` ← `src/client/auth.ts`
- `dist/config.js` ← `src/client/config.ts`
- `dist/firebase.js` ← `src/client/firebase.ts`
- `dist/geom.js` ← `src/client/geom.ts`
- `dist/journal.js` ← `src/client/journal.ts`
- `dist/liquid-glass.js` ← `src/client/liquid-glass.ts`
- `dist/reinf.js` ← `src/client/reinf.ts`
- `dist/summary.js` ← `src/client/summary.ts`
- `server/dist/**` ← `server/src/**`
- `functions/dist/**` ← `functions/src/**`
- `sw.js` ← `src/client/sw.ts`

Итог:

- legacy JS-исходников вне build-слоя не обнаружено;
- основной JS-шум был именно generated/runtime-слоем, а не параллельными JS-source файлами;
- правило “не создавать параллельные JS-копии TS-исходников” зафиксировано в `README.md` и `AGENTS.md`.

## 6. Самые большие и перегруженные файлы

Крупные и перегруженные файлы, которые остаются важными целями следующей волны рефакторинга:

- `src/client/app.ts`
- `src/client/app/modules/knowledge.ts`
- `src/client/app/modules/geometry.ts`
- `src/client/app/modules/reinforcement.ts`
- `server/src/services/ifc-import.ts`
- `style.css`

Что сделано сейчас:

- бессмысленного дробления не выполнялось;
- устранен дублирующийся shared/runtime-шум вокруг `profile-feed`;
- основная декомпозиция больших feature-файлов отложена как следующий безопасный этап.

## 7. Дублирование типов, моделей, интерфейсов

Что было найдено:

- полный дубль `profile-feed` логики между `server/src/services/profile-feed.ts` и `functions/src/services/profile-feed.ts`;
- отдельный JS-вариант той же логики в `scripts/build/build-profile-feed.mjs`;
- отсутствие фактического `src/shared`, несмотря на упоминание в `README.md`.

Что изменено:

- создан `src/shared/profile-feed.ts`;
- `server/src/services/profile-feed.ts` и `functions/src/services/profile-feed.ts` стали тонкими обертками над shared-модулем;
- `tsconfig.server.json` и `tsconfig.functions.json` обновлены так, чтобы компилировать `src/shared/**`.

Что осталось:

- `scripts/build/build-profile-feed.mjs` все еще содержит отдельную JS-реализацию генерации статического feed JSON.

Статус:

- это осознанно оставлено как отдельный build-layer script, потому что он должен запускаться standalone в CI без TS-runtime зависимости;
- дубликат зафиксирован, но runtime-дубли server/functions уже устранены.

## 8. Риски по безопасности и конфигурации

Что было рискованно:

- `server/serviceAccount.json` в репозитории/рабочем дереве;
- неполный `.gitignore`;
- хрупкая server-схема, ожидавшая service account рядом с runtime.

Что исправлено:

- удален `server/serviceAccount.json`;
- добавлен `server/serviceAccount.local.example.json`;
- обновлен `server/.env.example`;
- `server/src/index.ts` переведен на безопасный поиск credentials:
  1. env variables
  2. `FIREBASE_SERVICE_ACCOUNT_PATH`
  3. локальный untracked `serviceAccount.local.json`
  4. `applicationDefault()`
- `.gitignore` теперь исключает:
  - `server/node_modules`
  - `functions/node_modules`
  - `server/dist`
  - `functions/dist`
  - `tmp-chrome-*`
  - локальные `.env*`
  - локальные service account JSON

Оставшийся инфраструктурный риск:

- `firebase.json` по-прежнему публикует корень проекта как hosting public (`"public": "."`), поэтому deployable static surface остается смешан с корневым слоем проекта.

Статус:

- это не ломает проект, но ограничивает дальнейшее отделение `public/` от authoring/source слоев;
- вынесено как кандидат на отдельную инфраструктурную миграцию, а не на текущую безопасную зачистку.

## 9. План изменений по шагам

Запланировано в начале:

1. Зафиксировать аудит.
2. Обновить ignore/security-схему.
3. Очистить рабочее дерево от временных артефактов.
4. Устранить секреты.
5. Убрать дубли shared-логики.
6. Обновить README/AGENTS.
7. Прогнать проверки.
8. Обновить отчет по факту.

Статус:

- выполнено полностью.

## 10. Что было изменено фактически

Фактические изменения в кодовой базе:

- создан `src/shared/profile-feed.ts` как канонический shared runtime/module;
- `server/src/services/profile-feed.ts` и `functions/src/services/profile-feed.ts` переписаны на shared-слой;
- `functions/src/index.ts` переведен на нормальный TS import/export;
- `server/src/index.ts` переведен с гибридной схемы на TS imports и безопасный credential resolution;
- `server/src/services/ifc-import.ts` переведен на TS exports;
- обновлены `tsconfig.server.json` и `tsconfig.functions.json` для компиляции `src/shared/**`;
- обновлены `server/package.json` и `functions/package.json` под новые build entrypoints;
- обновлены `.gitignore`, `scripts/build/clean-runtime-artifacts.mjs`, `server/.env.example`;
- добавлен `server/serviceAccount.local.example.json`;
- удален `server/serviceAccount.json`;
- создан `AGENTS.md`;
- обновлен `README.md`;
- обновлены smoke-тесты под актуальный брендинг и текущую версию service worker cache.

Фактически удалено из рабочего дерева:

- `server/serviceAccount.json`
- `.firebase`
- `node_modules`
- `server/node_modules`
- `functions/node_modules`
- `dist`
- `server/dist`
- `functions/dist`
- все `tmp-chrome-*`
- корневой `sw.js`

Примечание:

- build/test были успешно выполнены до финальной санитарной очистки, после чего generated/local runtime слои были снова удалены.

## 11. Что осталось как TODO

Следующие логичные 5 шагов:

1. Декомпозировать `src/client/app.ts` на более явные `state / bindings / actions / services` модули.
2. Разделить `src/client/app/modules/knowledge.ts` на контентный слой и UI-логику.
3. Постепенно дробить `server/src/services/ifc-import.ts` на parser/adapters/geometry helpers без изменения бизнес-логики.
4. Вынести `scripts/build/build-profile-feed.mjs` на более явный shared data-source, если позже появится безопасный TS build-runtime для CI.
5. Отдельно спланировать инфраструктурный перенос deploy surface из корня в `public/` или эквивалентный publish-layer.

Кандидаты на ручную проверку:

- целесообразность переноса корневых HTML/CSS в отдельный authoring/public layer;
- дальнейшая нормализация `style.css`, если потребуется дробление по страницам/feature-секциям.

## Phase 2 — Client Architecture Cleanup

Дата выполнения: 2026-04-15.

Цель фазы:

- не переписывать клиент с нуля;
- уменьшить реальный монолит `src/client/app.ts`;
- отделить runtime/use-case код от entrypoint;
- убрать повторяющиеся BIM/IFC helpers из feature-модулей;
- сохранить восстановленную работу BIM-viewer и IFC import.

### Что было декомпозировано

`src/client/app.ts`

- было примерно `5994` строк;
- стало примерно `5521` строк;
- из entrypoint вынесено около `470` строк runtime/type/UI-шумa;
- `app.ts` теперь меньше занимается IFC import/delete деталями и больше работает как координатор.

Вынесенные responsibility boundaries:

- `src/client/app/ifc-import-runtime.ts`
  - владеет IFC import/delete use-cases;
  - содержит single-flight ключи;
  - управляет состоянием кнопок IFC import;
  - управляет IFC action menu;
  - выполняет cache save/delete;
  - вызывает refresh загруженных BIM-модулей после import/delete.
- `src/client/app/profile-runtime.ts`
  - владеет загрузкой имени инженера текущего пользователя;
  - управляет avatar/header profile state;
  - публикует `globalThis.currentUserEngineerName` как совместимый runtime bridge.
- `src/client/app/geo-bim-types.ts`
  - содержит типы геодезической BIM-привязки;
  - убирает domain-specific interfaces из entrypoint.
- `src/client/app/services/bim-runtime-context.ts`
  - единый источник для `currentProjectId` и текущего IFC-файла;
  - заменил локальные дубли `getCurrentIfcFile` в BIM feature-модулях.
- `src/client/app/services/module-activation.ts`
  - единая обертка для события `app:tab-activated`;
  - `module-runtime.ts` больше не создает CustomEvent inline.
- `src/client/app/ui/node-card-interactions.ts`
  - общий helper для compact node cards;
  - общий delete icon button;
  - заменил дубли в `geometry.ts`, `reinforcement.ts`, `strength.ts`.
- `src/client/app/modules/knowledge-catalog.ts`
  - вынесены категории и navigation constants базы знаний;
  - `knowledge.ts` все еще содержит основной HTML-контент статей, но каталог отделен от DOM/runtime кода.

### Какие крупные feature-файлы были сокращены

- `src/client/app/modules/geometry.ts`
  - удален локальный дубль `getCurrentIfcFile`;
  - удален локальный дубль `NodeCardInteractionOptions`;
  - удалены локальные `buildNodeDeleteIconButton` и `setupNodeCardInteractions`;
  - tab activation переведен на `onAppTabActivated`.
- `src/client/app/modules/reinforcement.ts`
  - аналогично удалены локальные дубли BIM/IFC context и node-card helpers;
  - tab activation переведен на `onAppTabActivated`.
- `src/client/app/modules/strength.ts`
  - удален локальный дубль `getCurrentIfcFile`;
  - удален локальный `buildNodeDeleteIconButton`;
  - tab activation переведен на `onAppTabActivated`.
- `src/client/app/modules/knowledge.ts`
  - каталог категорий и scroll threshold вынесены в `knowledge-catalog.ts`.

### Что удалено как legacy

- В `src/client` не осталось legacy `.js` файлов.
- Добавлен smoke-тест, который проверяет отсутствие `.js` копий в `src/client`.
- Новых параллельных JS-копий TS-исходников не создано.

### Что осталось крупным и почему

- `src/client/app.ts` все еще большой (`~5521` строк), потому что в нем остается геодезический module runtime, DOM bindings и расчеты узлов. Дальнейшее дробление нужно делать по feature-группам, а не механически.
- `src/client/app/modules/knowledge.ts` все еще крупный (`~3907` строк), потому что содержит большой HTML-контент статей. Полный вынос контента лучше делать отдельной фазой с snapshot/smoke проверкой статей.
- `src/client/app/modules/geometry.ts`, `reinforcement.ts`, `strength.ts` остаются крупными, потому что содержат формы, rendering, validation и Firestore access в одном файле. В этой фазе вынесены только безопасные общие helpers.
- `src/client/modules/summary/analytics-block.ts` остается крупным и требует отдельного разреза на calculation/rendering/adapters.
- `style.css` остается крупным. Файл уже имеет секционные комментарии, но физическое дробление CSS не выполнено в этой фазе, чтобы не рисковать путями подключения и cache/service worker поведением после недавних MIME/404 проблем.

### Проверки после Phase 2

Успешно выполнено:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`

Результат тестов:

- `12` smoke-тестов;
- `12` passed;
- добавлены проверки:
  - отсутствие legacy `.js` файлов в `src/client`;
  - IFC import runtime не встроен обратно в `app.ts`;
  - BIM viewer получает project/IFC context во всех BIM-модулях.

### Следующие 3 шага

1. Разрезать `knowledge.ts` на `knowledge-articles-data` и `knowledge-rendering`, сохранив текущий HTML и поиск без изменения поведения.
2. Декомпозировать геодезическую часть `app.ts`: отдельно `geo-state`, `geo-dom-bindings`, `geo-node-actions`, `geo-node-evaluation`.
3. Отдельной фазой подготовить CSS build pipeline для безопасного физического разделения `style.css` на `base / layout / components / modules / utilities`.

## Final Phase — Client Cleanup

Дата выполнения: 2026-04-15.

Цель фазы:

- довести `src/client/app.ts` ближе к coordinator-entrypoint без переписывания геодезического runtime;
- отделить computation/data-prep от UI в summary analytics;
- вынести data/content слой базы знаний из runtime-файла;
- не менять бизнес-логику и не трогать визуальное поведение.

### Что вынесено из `app.ts`

`src/client/app.ts`

- было после Phase 2: примерно `5521` строк;
- стало после финальной фазы: примерно `5330` строк;
- entrypoint больше не содержит функции оценки проверок и часть pure BIM/geo helpers.

Новые/расширенные границы:

- `src/client/app/inspection-evaluation.ts`
  - `evaluateGeoColumnNode`;
  - `evaluateGeoWallNode`;
  - `evaluateGeoBeamNode`;
  - `evaluateGeoNode`;
  - `evaluateReinfCheck`;
  - `evaluateStrengthCheck`.
- `src/client/app/geo-bim-utils.ts`
  - нормализация BIM snapshot values;
  - форматирование BIM display values и коротких IFC GUID;
  - parse/format numeric BIM fields;
  - расчет и группировка geo grid samples;
  - поиск ближайших осей;
  - форматирование линейной BIM-привязки.

Что осталось в `app.ts` осознанно:

- DOM bindings геодезической формы;
- orchestration IFC/BIM состояния;
- загрузка/сохранение geo nodes;
- legacy-compatible глобальные bridges для существующего HTML/runtime.

Эти части требуют отдельного разреза по `geo-state / geo-dom / geo-actions / geo-repository`, потому что они плотно связаны с текущей формой и Firestore side effects.

### Что вынесено из `analytics-block.ts`

`src/client/modules/summary/analytics-block.ts`

- было после Phase 2: примерно `3137` строк;
- стало после финальной фазы: примерно `2167` строк;
- файл теперь отвечает преимущественно за UI: состояния, таблицы, диаграммы, PDF export, взаимодействие с контролами.

Новые границы:

- `src/client/modules/summary/analytics-core.ts`
  - pure helpers;
  - нормализация module/source labels;
  - formatting;
  - quality index и grading.
- `src/client/modules/summary/analytics-data.ts`
  - нормализация inspection records;
  - извлечение измерений из geo/reinforcement/geometry;
  - расчет analytics model проекта;
  - ranking проектов;
  - агрегация подрядчиков;
  - legacy source resolution для старых inspection records.

Smoke-регрессия:

- добавлена проверка, что `analytics-block.ts` импортирует `analytics-data.ts` и `analytics-core.ts`;
- добавлена проверка, что `calculateProjectAnalytics`, `extractMeasurements`, `calculateQualityIndex` не встроены обратно в UI block.

### Что вынесено из `knowledge.ts`

`src/client/app/modules/knowledge.ts`

- было после Phase 2: примерно `3907` строк;
- стало после финальной фазы: примерно `3829` строк;
- runtime базы знаний теперь импортирует метаданные статей и content helpers, а не хранит весь каталог внутри UI/runtime файла.

Новые границы:

- `src/client/app/modules/knowledge-articles.ts`
  - статический список статей;
  - title/category/subcategory/construction/tags;
  - один источник истины для article metadata.
- `src/client/app/modules/knowledge-content-utils.ts`
  - HTML helpers для списков;
  - HTML helpers для paragraph blocks;
  - общий builder expanded sections.

Что осталось крупным:

- HTML-контент самих статей пока остается в `knowledge.ts`.
- Полный вынос article content builders лучше делать отдельной безопасной фазой с snapshot/smoke проверкой количества статей и fallback content, чтобы не потерять справочный текст.

### Что сделано со `style.css`

Физическое дробление `style.css` не выполнено.

Причина:

- недавно уже были ошибки MIME/404 и service worker cache вокруг CSS/`dist`;
- текущая загрузка стилей завязана на корневой deployable surface;
- безопасное дробление требует предварительного CSS build/concat pipeline и smoke-теста на доступность итогового stylesheet.

Текущий безопасный план:

- оставить `style.css` как runtime stylesheet до появления CSS pipeline;
- первым шагом вынести секции в `src/client/styles/**`;
- сборкой конкатенировать их обратно в корневой `style.css`;
- только после этого менять структуру подключения и service worker discovery.

### Что удалено как legacy

- Новых legacy `.js` файлов в `src/client` не появилось.
- В `src/client` нет параллельных JS-копий TS-исходников.
- Старый встроенный массив `KNOWLEDGE_ARTICLES` удален из `knowledge.ts`; канонический источник теперь `knowledge-articles.ts`.
- Расчетный слой summary analytics удален из UI-файла и перенесен в `analytics-data.ts`.

### Проверки после Final Phase

Успешно выполнено:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`

Результат тестов:

- `15` smoke-тестов;
- `15` passed;
- добавлены проверки:
  - `app.ts` не содержит обратно встроенные inspection evaluation и BIM helper functions;
  - `analytics-block.ts` не содержит обратно встроенный calculation/data-prep слой;
  - `knowledge.ts` импортирует article metadata и content helpers из отдельных модулей.

### Следующие 3 шага

1. Разрезать оставшуюся геодезическую часть `app.ts` на `geo-state`, `geo-dom-bindings`, `geo-node-actions`, `geo-repository` с сохранением существующих global bridges.
2. Вынести article content builders из `knowledge.ts` в `knowledge-content.ts` или data-oriented набор файлов и добавить smoke/snapshot проверку доступности всех статей.
3. Подготовить CSS pipeline: `src/client/styles/base|layout|components|modules|utilities` -> generated root `style.css`, затем физически разделить большой stylesheet без риска MIME/cache регрессий.

## Phase 3 — Feature Colocation

Дата выполнения: 2026-07-24.

Цель фазы:

- убрать внутренние feature-файлы из корня `src/client`;
- объединить параллельные ветки `src/client/modules` и `src/client/app/modules`;
- удалить подтвержденный неиспользуемый legacy helper;
- зафиксировать понятные правила размещения нового клиентского кода.

Изменения:

- `geom.ts` перенесен в `app/modules/geometry/data.ts`;
- `reinf.ts` перенесен в `app/modules/reinforcement/data.ts`;
- `journal.ts` перенесен в `app/modules/journal/data.ts`;
- `summary.ts` перенесен в `app/modules/summary/data.ts`;
- весь `src/client/modules/summary/**` перенесен в
  `src/client/app/modules/summary/**`;
- удален неиспользуемый `app/ui/legacy-node-card.ts`, который был заменен
  общим `app/ui/node-card-interactions.ts`;
- обновлены статические и динамические импорты, build copy paths и список
  service worker assets;
- добавлена карта структуры `src/client/README.md`;
- добавлен smoke-тест, запрещающий возврат feature data-файлов в корень клиента.

Проверка неиспользуемых файлов:

- граф статических импортов дополнительно проверен с учетом HTML entrypoints,
  Web Worker, vendor build entrypoint, service worker и ambient declarations;
- других файлов, которые можно безопасно удалить без ручной проверки runtime,
  не найдено.

Проверки после Phase 3:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `30/30` smoke-тестов успешно.

## Phase 4 — Repository Layout Cleanup

Дата выполнения: 2026-07-28.

Цель фазы:

- убрать подтверждённый устаревший статический снимок;
- разнести служебные сценарии по назначению;
- приблизить runtime профиля и объекта к feature-colocation;
- сохранить все публичные пути, внешний вид и поведение.

Изменения:

- удалён `mobile-preview.html`: файл не входил в hosting surface, не
  подключался из HTML/manifest/service worker и являлся устаревшей копией
  главной страницы;
- `scripts/*.mjs` распределены по `scripts/build`, `scripts/checks` и
  `scripts/dev`;
- обновлены корневой `package.json`, `server/package.json` и вычисление
  `projectRoot` после переноса сценариев;
- добавлена карта `scripts/README.md`;
- `app/profile-runtime.ts` и `app/data/profile-feed-fallback.ts` перенесены в
  `app/profile/`;
- `app/project-runtime.ts` перенесён в `app/project/`;
- обновлены статические и HTML-импорты;
- добавлены smoke-регрессии, запрещающие возврат runtime-файлов и служебных
  сценариев в прежние плоские каталоги.

Проверка зависимостей:

- построен граф относительных импортов клиентского TypeScript с учётом
  entrypoints, динамических импортов, worker и vendor build entrypoint;
- отдельно проверены HTML-импорты, npm scripts, server scripts, hosting
  allowlist и service worker assets;
- точных дубликатов среди tracked source-файлов не найдено;
- других файлов, безопасных для удаления без ручной runtime-проверки, не
  обнаружено.

Проверки после Phase 4:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `37/37` smoke-тестов успешно.

## Phase 5 — Feature-Based Modular Monolith

Дата выполнения: 2026-07-29.

Цель фазы:

- перейти от каталогов по типу к первым вертикальным features;
- уменьшить `app.ts` реальным переносом orchestration, а не legacy-wrapper;
- заменить часть скрытого mutable context явными импортами;
- вынести безопасный inline JavaScript без изменения публичного поведения.

### Этап A — runtime context

- `globalThis.LS` заменён прямым импортом `APP_STORAGE_KEYS` в geometry,
  reinforcement, strength и journal;
- удалены ambient declarations `LS`;
- добавлена регрессия, запрещающая возврат bridge.

Проверки этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `38/38`.

### Этап B — vertical features

- UI и service control-plan перенесены в `features/control-plan`;
- добавлен небольшой публичный `features/control-plan/index.ts`;
- control-plan и summary используют общий `shared/date-time.ts`;
- две дублирующиеся реализации `formatLastCheckDate` удалены;
- project context, design use cases и runtime перенесены в
  `features/projects`;
- `app.ts` импортирует projects только через feature public API;
- добавлен compatibility public API journal для чтения данных control-plan.

Каждый перенос отдельно прошёл:

- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- `npm test`.

### Этап C — уменьшение entrypoint

- construction selector и формирование construction payload вынесены в
  `features/projects/construction-selection.ts`;
- DOM elements передаются фабрике явно;
- `app.ts` уменьшен с 6 154 до 5 888 физических строк;
- добавлен regression limit и запрет возвращать selector implementation в
  entrypoint.

Проверки этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `39/39`.

### Этап D — HTML module

- inline module страницы privacy перенесён в `app/pages/privacy.ts`;
- HTML подключает собранный `dist/app/pages/privacy.js`;
- синхронный pre-paint theme bootstrap оставлен inline для предотвращения
  вспышки неверной темы;
- публичный URL страницы и формат разметки сохранены.

Проверки этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `39/39`.

### Финальный аудит зависимостей

- 77 исполняемых TypeScript-файлов;
- 0 статических циклических импортов;
- 0 использований `globalThis.LS`;
- новых `globalThis` bridges не добавлено;
- старые пути control-plan и projects отсутствуют в production imports;
- Firebase repository остаётся централизованным;
- generated output вручную не редактировался.

Оставшийся долг:

- перенести geodesy form, node actions и BIM/geodesy binding из `app.ts`;
- ввести use-case boundaries перед удалением прямых Firebase imports из
  inspection UI;
- перенести journal, summary, knowledge и inspections целиком с небольшими
  публичными API;
- отдельно мигрировать inline modules about, profile и edit-profile;
- продолжить сокращение `utils.ts` по предметным областям.

## Geodesy vertical slice — 2026-07-29

Выполнен отдельный поведенчески нейтральный этап:

- создан `src/client/features/inspections/geodesy` с публичным `index.ts`;
- `app/services/geo-nodes.ts` перенесён внутрь feature и разделён по
  ответственности: DOM bindings, изменяемое состояние геодезической формы и
  BIM selection, node actions, список узлов, service и Firestore adapter;
- geodesy service работает через порт repository; Firebase SDK и
  централизованный Firestore repository не импортируются DOM/node actions;
- сохранены существующие коллекции `geoNodes`, `elements`, dual-write в
  `inspections` и формат документов;
- journal получает node API через явный bootstrap parameter;
- удалены заменённые bridges `saveNodes`, `renderNodes`, `loadNode`,
  `evaluateGeoNode`, `currentColumnNodeKey`, `currentWallNodeKey` и
  `currentBeamNodeKey`;
- добавлены поведенческие тесты загрузки, сохранения, отказа dual-write,
  удаления, очистки и синхронизации локального node state.

Проверки после service boundary и после state/DOM/actions выполнялись отдельно:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `47/47`.

Оставшийся geodesy-долг:

- перенести BIM/geodesy selection runtime отдельным этапом без изменения BIM
  pipeline;
- заменить оставшийся read-only `globalThis.nodes` context в overview/summary
  явным публичным API после миграции этих потребителей.

## Geodesy form runtime — 2026-07-29

Выполнен следующий отдельный этап только для геодезической формы:

- `app.ts` уменьшен примерно с 5 800 до 2 280 строк;
- `runtime.ts` создаёт state, form, handlers и node actions, связывает их через
  явные параметры и возвращает небольшой runtime API;
- `form.ts` отвечает за чтение, очистку, восстановление и rendering колонн,
  стен, балок и обычных узлов, включая текущие ключи редактирования;
- `evaluation.ts` содержит чистые расчёты допусков и формирование journal
  payload без DOM и инфраструктурных импортов;
- `handlers.ts` содержит действия проверки, сохранения, обновления и очистки;
- `types.ts` фиксирует известные структуры state и документов без `any`;
- дублирующиеся геодезические расчёты удалены из
  `app/inspection-evaluation.ts`;
- Firestore-формат, dual-write и journal integration сохранены; repository
  импортирует только инфраструктурный `firestore-service.ts`, а UI и расчёты
  работают через переданные service/callback зависимости;
- в feature не добавлены `globalThis`, прямые импорты Firebase SDK или новые
  compatibility bridges;
- добавлены поведенческие тесты расчётов, journal payload и очистки состояния
  формы.

Осознанно не входит в этот этап:

- BIM/geodesy selection runtime остаётся в `app.ts` до следующего отдельного
  изменения;
- CSS, bundler, Service Worker, BIM pipeline и другие inspection features не
  изменялись;
- дальнейшее деление крупных `form.ts` и `handlers.ts` возможно только при
  появлении самостоятельной поведенческой границы и regression-тестов.

Финальная проверка этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `51/51` тест успешно.

## Geodesy BIM selection runtime — 2026-07-29

Выполнен отдельный этап только для выбора и привязки BIM-элемента к
геодезической проверке:

- `bim-selection.ts` содержит чистые преобразования: фильтрацию, разрешение
  выбранного/ручного/недоступного состояния, восстановление snapshot,
  нормализацию загруженных записей и BIM payload геодезического узла;
- `bim-selection-runtime.ts` владеет geodesy-specific BIM state, axis hints,
  rendering фильтров, списка и snapshot, применением элемента к форме,
  восстановлением сохранённой привязки и DOM listeners;
- `runtime.ts` создаёт BIM runtime с явными зависимостями; form и handlers
  используют один небольшой BIM API;
- из `app.ts` удалены geodesy-specific BIM filters, selection, rendering,
  snapshot и handlers; entrypoint только передаёт DOM, project/IFC context и
  общие callbacks; готовый `GeodesyDomBindings` передаётся одним объектом;
- общий IFC import runtime, `bim-elements`, BIM visual panel и That Open
  pipeline не переносились и не изменялись;
- удалены ставшие неиспользуемыми `app/geo-bim-types.ts`,
  `app/geo-bim-utils.ts` и общий `initGeoBimBindings`;
- публичный `features/inspections/geodesy/index.ts` содержит только четыре
  production entrypoints, используемые bootstrap-кодом;
- Firestore-формат BIM-полей сохранён; feature UI и преобразования не
  импортируют Firebase SDK или централизованный repository;
- `globalThis.nodes` и BIM-поддержка geometry, reinforcement и strength не
  изменялись.

Добавлены поведенческие regression-тесты:

- выбор доступного BIM-элемента;
- совместная фильтрация по поиску, типу и осям;
- переход в ручной режим;
- восстановление сохранённой BIM-привязки;
- недоступный и soft-deleted BIM-элемент;
- формирование BIM-данных для сохранения узла без изменения полей Firestore.

Оставшийся долг:

- удалить read-only `globalThis.nodes` при миграции overview/summary;
- переносить BIM boundaries geometry, reinforcement и strength отдельными
  feature-этапами;
- делить крупный DOM runtime только по самостоятельным поведенческим границам.

Финальная проверка этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `58/58` тестов успешно.

## Strength state, evaluation and storage boundary — 2026-07-30

Выполнен первый отдельный этап рефакторинга прочности бетона:

- создан `src/client/features/inspections/strength` с файлами `types.ts`,
  `state.ts`, `evaluation.ts`, `service.ts`, `firestore-service.ts` и
  небольшим production API в `index.ts`;
- `StrengthState` владеет стабильной коллекцией `checks` и текущим
  `currentCheckId`; заменены глобальные `strengthChecks` и
  `currentStrengthCheckId`;
- нормативная прочность, итоговый статус и данные графика вычисляются чистыми
  функциями без DOM, Firebase SDK и `globalThis`;
- сохранена действующая формула: 20% проектной прочности при возрасте менее
  суток, логарифмический рост до 28 суток и полная проектная прочность начиная
  с 28 суток;
- source-записи `strengthChecks` и аналитическая проекция `inspections`
  загружаются и изменяются через service port; Firestore adapter остаётся над
  централизованным repository;
- сохранены текущий Firestore-формат, hard delete/clear и best-effort
  dual-write при сохранении;
- legacy DOM rendering, Chart.js и BIM selection не переносились, но
  `app/modules/strength.ts` больше не импортирует Firebase SDK или Firestore
  repository и получает state/service/callbacks явно;
- journal, overview и summary получают strength state через небольшие API;
  callbacks journal, notifications и summary передаются runtime-кодом;
- дублирующийся `StrengthCheckRecord` удалён из общего `module-records.ts`;
- добавлены поведенческие тесты граничных возрастов, неполных данных,
  соответствия/недобора, фильтрации soft-deleted записей, create/update
  dual-write, отказа dual-write, удаления, очистки и current check state.

Осознанно не входит в этап:

- перенос strength DOM rendering, Chart.js и BIM selection;
- изменения geometry, reinforcement, geodesy, CSS, bundler, Service Worker и
  формата Firestore.

Финальная проверка этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `68/68` тестов успешно.

## Strength form and actions runtime — 2026-07-30

Выполнен второй отдельный этап рефакторинга прочности бетона:

- `dom.ts` централизует получение и типизацию DOM-элементов формы;
- `form.ts` отвечает за инициализацию, чтение, восстановление, валидацию и
  очистку формы, не обращаясь к Firebase или repository;
- `handlers.ts` содержит check/save/update/load/delete/clear actions,
  локальное rendering проверок, управление `currentCheckId`, состояниями
  `inspectionState`/`inspectionChecked` и journal integration;
- `chart.ts` владеет жизненным циклом графика и получает конструктор Chart.js
  явной зависимостью;
- `runtime.ts` связывает существующие `StrengthState`, `StrengthService`,
  форму, handlers, график и переданные приложением внешние эффекты;
- `app/modules/strength.ts` сокращён до compatibility entrypoint и оставленного
  на следующий этап BIM selection runtime;
- UI feature не импортирует Firebase SDK или Firestore repository; доступ к
  данным по-прежнему проходит через `StrengthService`;
- сохранены формула, Firestore-формат, dual-write, журнал, внешний вид и
  пользовательское поведение, включая сенсорный выбор класса бетона.

Добавлены поведенческие regression-тесты:

- проверка с полными данными и без фактической прочности;
- создание и обновление проверки;
- восстановление записи в форму;
- удаление и очистка всех проверок;
- уничтожение и повторное создание графика;
- формирование journal payload.

Осознанно не входит в этап:

- strength BIM selection и общий IFC/BIM pipeline;
- изменения geodesy, reinforcement, geometry, CSS, bundler, Service Worker и
  формата Firestore.

Финальная проверка этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `77/77` тестов успешно.

## Strength BIM selection runtime — 2026-07-30

Завершён третий отдельный этап и текущий vertical slice прочности:

- чистые нормализация, фильтрация, выбор, snapshot, восстановление, payload и
  политика очистки ручных полей перенесены в `bim-selection.ts`;
- состояние BIM selection, rendering, listeners, подсветка полей, загрузка
  элементов и visual panel integration перенесены в
  `bim-selection-runtime.ts`;
- чистый модуль не импортирует DOM, Firebase SDK или repository;
- BIM UI runtime получает `StrengthService`, DOM bindings, project/IFC context,
  construction action и form accessor явными зависимостями;
- существующий `StrengthRuntime` по-прежнему работает с одним небольшим BIM API;
- `app/modules/strength.ts` сокращён с 969 до 138 строк и теперь только
  конфигурирует feature runtime и предоставляет compatibility exports старому
  module bridge;
- публичный `strength/index.ts` содержит только production API, фактически
  используемый bootstrap/module-runtime и compatibility entrypoint;
- общий IFC import, `bim-elements`, `bim-visual-panel`, module activation и
  That Open pipeline остались общими app dependencies;
- Firestore BIM-поля, ручной режим, внешний интерфейс и пользовательское
  поведение не изменены.

Добавлены поведенческие regression-тесты:

- выбор доступного BIM-элемента;
- комбинированная фильтрация по поиску, типу и осям;
- ручной режим;
- восстановление сохранённой BIM-привязки;
- недоступный и soft-deleted BIM-элемент;
- сохранение BIM payload в прежнем формате;
- сохранение ручных полей при снятии привязки.

Осознанно не входит в этап:

- изменения geodesy, reinforcement, geometry, CSS, bundler, Service Worker,
  общего IFC pipeline и Firestore-формата.

Финальная проверка этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `84/84` теста успешно.

## Reinforcement state, evaluation and storage boundary — 2026-07-30

Выполнен первый отдельный этап рефакторинга армирования:

- создан `src/client/features/inspections/reinforcement` с `types.ts`,
  `state.ts`, `evaluation.ts`, `service.ts`, `firestore-service.ts` и
  небольшим production API в `index.ts`;
- `ReinforcementState` владеет `checks`, `currentCheckId`, `columns`, `beams`
  и `walls`; модуль больше не создаёт параллельное mutable state;
- добавление, удаление, лимиты, нормализация маркировок, поиск дубликатов и
  очистка строк реализованы state actions без DOM, Firebase и `globalThis`;
- дубликаты стен сравниваются по нормализованной паре крайних осей независимо
  от порядка;
- strict diameter match, допуски шага, защитного слоя и хомутов, итоговый
  status/summary и journal payload вынесены в чистый `evaluation.ts`;
- загрузка active-записей, create/update/delete/clear и best-effort
  dual-write вынесены в `ReinforcementService`;
- Firebase SDK и централизованный repository импортируются только
  `firestore-service.ts`; legacy UI получает service и внешние callbacks через
  module runtime;
- `globalThis.reinfChecks` и `globalThis.currentReinfCheckId` удалены, а
  journal, overview и summary получают state явными зависимостями;
- `app/modules/reinforcement/data.ts` оставлен как stateless compatibility
  adapter для сохранения существующего build/Service Worker пути;
- Firestore collection `reinfChecks`, формат source-документов и проекции
  `inspections` сохранены.

Добавлены поведенческие regression-тесты:

- добавление, удаление, лимиты и очистка колонн, балок и стен;
- дубликаты маркировок и стен с переставленными крайними осями;
- расчёты в допуске, превышение и strict match;
- загрузка без soft-deleted записей;
- create/update/delete/clear, dual-write и отказ dual-write;
- явное изменение `currentCheckId`;
- формирование status, summary и journal payload.

Осознанно не входит в этап:

- перенос reinforcement DOM rendering и handlers;
- перенос reinforcement BIM selection и visual panel integration;
- изменения geodesy, strength, geometry, CSS, bundler, Service Worker,
  общего IFC pipeline и Firestore-формата.

Финальная проверка этапа:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно;
- `npm run build` — успешно;
- `npm test` — `96/96` тестов успешно.
