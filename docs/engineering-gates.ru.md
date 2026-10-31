# Постепенное усиление инженерных проверок

[English](engineering-gates.md)

Первый набор этапа 8, 31 октября 2026, база `c36954f`.

`npm run typecheck:engineering` использует `tsconfig.engineering.json` и входит в существующий `npm run typecheck`/CI. Включены `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` и `useUnknownInCatchVariables` для критериев приёмки, текущего статуса оценки, ключей размеров геометрии и геодезического evaluation. Проверяются также импортированные контракты типов геодезии/domain. Emit отсутствует, ambient Node/DOM globals не подключаются, глобальный legacy-конфиг не меняется.

Исходная оценка выявила две ошибки индексного доступа в одном выражении геодезии. Локальные значения позволяют TypeScript проверить существующие null-guards без non-null assertions, casts или подавлений. Вход текущего статуса теперь `Record<string, unknown>` вместо `any`. Поведенческая регрессия дополнительно выявила превращение пробельных координат в ноль: теперь они неполны, настоящий ноль остаётся допустимым. Идентичности, единицы, критерии и формат сохранённых данных не меняются.

ESLint применяет `no-explicit-any` и `no-non-null-assertion` к выбранным leaf-модулям и всем четырём инженерным feature `evaluation.ts`. Запрещены известные UI/runtime/service/repository/infrastructure/Firebase imports, включая type imports и re-exports. Запрещены динамические imports, CommonJS require и глобальное браузерное состояние. Чистые construction/inspection applicability contracts остаются зависимостями; они не перемещаются и не объявляются strict. Это ограниченный архитектурный gate, не проверка всего графа зависимостей. Глобальный strict и широкие type-aware lint правила отложены.

`tests/core/engineering-gates.test.mjs` запускает настоящие CLI ESLint/TypeScript с отрицательными fixtures и проверяет конкретные diagnostic rules. Он подтверждает отказ при null assignment, implicit any, unchecked array access и explicit undefined optional properties, а также успешную проверку реального strict-набора. `tests/core/engineering-contracts.test.mjs` проверяет публичные калькуляторы без моков инженерной логики: метры→миллиметры, знаковые/асимметричные/граничные допуски, неполные/пробельные/нечисловые данные, положительность размеров, десятичную запятую, применимость винтовых/буронабивных свай и неполную геометрию балки.

Legacy `evaluateReinfCheck` проверяется как тот же объект функции, что и `evaluateReinforcementCheck`, а не отдельный расчёт. Проверка четырёх evaluators и фасада не выявила другой полной дублирующей реализации; это не утверждение об уникальности каждого parser/formatting helper во всём проекте. Разные контракты единиц, локали и применимости сохранены; общий framework расчётов не вводился.

Дальнейший rollout: сначала оценить compiler closure construction applicability, реестра и остальных evaluators, затем усиливать их типизацию. Основной клиент/сервер сохраняют legacy-base. Расширять проверки реальных границ при следующих изменениях, без ослабления типов и глобального strict без оценки последствий.
