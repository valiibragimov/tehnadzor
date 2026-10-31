# BIM catalog measurements — 31 October 2026

Synthetic local measurements, Windows, Node 22.23.4 and installed headless Chrome. These are single runs with five searches, not device-independent latency guarantees. No production data or Firebase network latency is included. Run `node scripts/checks/measure-bim-catalog.mjs` after a complete client build; the script prints JSON and uses CDP GC/heap metrics. Browser flags permitting explicit GC are benchmark-only.

| Elements | Browser normalization + sorting, ms | Search before, ms (five samples) | Search after, ms (cold; warm samples) | Catalog heap before / after, MiB |
|---|---:|---|---|---:|
| 10k | 15.7 | 14.9, 12.8, 12.1, 11.4, 11.4 | 17.3; 2.2, 1.7, 1.5, 1.6 | 2.6 / 5.7 |
| 50k | 64.6 | 60.8, 59.5, 61.2, 57.7, 57.4 | 77.8; 6.8, 12.2, 5.3, 5.0 | 12.1 / 28.2 |
| 100k | 128.2 | 116.5, 114.8, 114.7, 114.2, 168.0 | 141.9; 15.3, 23.6, 10.6, 11.1 | 23.6 / 55.2 |

Before-search means the optimized sorter without search caching. A separate Node differential run of normalization + sorting measured 82/300/602 ms before and 20/88/196 ms after on 10k/50k/100k records. It retains input records as well as derived elements; its heap numbers are not interchangeable with Chrome's. Synthetic identifiers are reverse ordered; the regression additionally exercises a deterministically shuffled input.

Search caches trade retained strings for repeated-query latency. A weak key owns each entry; its field signature includes every searchable field and the translated type label. Mutable records, resolved axes and language changes invalidate it. No global full-catalog index or retained page registry was added. After dropping the browser catalog and forcing GC, heap growth over the pre-run baseline was 0.50/1.77/2.06 MiB rather than 5.7/28.2/55.2 MiB. This includes JIT/module and WeakMap capacity overhead, not an assertion of zero retained memory.

| IFC columns | Worker read + parse + transfer, ms | PostMessage transfer, ms | JSON result size, MiB | Main heap with result / after release, MiB |
|---|---:|---:|---:|---:|
| 10k | 350 | 14 | 5.21 | 5.60 / 2.59 |
| 50k | 1042 | 70 | 26.12 | 19.42 / 4.35 |
| 100k | 2142 | 179 | 52.25 | 36.56 / 6.42 |

The IFC fixture repeats valid columns with unique IDs and shared representation/placement. First/last X remain 1000 mm. It is a metadata/worker scalability fixture, not representative mesh complexity. Result size is serialized JSON size, not transport bytes. Transfer timing includes structured clone and scheduling, via benchmark-only postMessage timestamps. Main heap excludes worker/WASM/native/GPU memory; no claim of peak process-memory measurement is made. The worker is terminated on completion/error/timeout. Large production IFCs and low-memory devices remain unmeasured.

Checks cover actual WebIFC engineering fixtures, worker import, IndexedDB file roundtrip and project-scoped deletion, viewer close/reopen and disposal, immutable publication/reader fencing through the existing emulator suite. The parser closes its model in finally; viewer replacement/close disposes the engine. No parser, worker protocol, Firestore schema, revision, epoch, reader lease or GC policy was changed.

The full metadata catalog still exists. Streaming geometry, worker transfer redesign and a persistent multi-project search index were not introduced: current measurements justify local sorting/search work, not a data migration. Cold search still takes about 142 ms at 100k; search caching increases catalog memory. Establish a target-device memory budget before accepting larger models or claiming the original memory-risk is closed.

## Русская версия: методика и ограничения

Локальный синтетический замер 31 октября 2026: Windows, Node 22.23.4, headless Chrome. Таблицы выше общие для обеих языковых версий. Это единичные прогоны с пятью поисками, а не гарантия задержки на любом устройстве. Firebase-сеть и production-данные не использовались. После полной сборки запуск: `node scripts/checks/measure-bim-catalog.mjs`. JSON выводится в stdout; CDP измеряет JS heap после принудительного GC. Флаг GC включается только в benchmark.

Первый столбец загрузки — нормализация и сортировка метаданных, не чтение Firestore. Отдельный сравнительный Node-прогон дал 82/300/602 мс до изменения и 20/88/196 мс после на 10k/50k/100k. Он удерживает также исходные записи, поэтому его heap нельзя сравнивать с Chrome. Идентификаторы в benchmark идут в обратном порядке; регрессия использует также перемешанный порядок.

Поисковый кеш обменивает память на скорость повторных запросов. WeakMap не удерживает элементы сильными ссылками; подпись включает все поисковые поля и перевод типа. Изменения марки, названия, resolvedAxes и языка обновляют текст. Нет постоянного индекса нескольких проектов. На 100k warm search ускорился примерно со 115 до 11–24 мс, но cold search остался около 142 мс, а heap каталога вырос с 24 до 55 MiB. После удаления ссылок и GC прирост относительно базы составил 0,50/1,77/2,06 MiB, включая JIT/модули и ёмкость WeakMap. Это не обещание нулевого удержания.

IFC-набор повторяет корректные колонны с уникальными ID и общей геометрией/размещением. X первого и последнего элемента — 1000 мм. Это тест масштаба метаданных/worker, не сложности геометрии. На 100k полный импорт занял 2,14 с, передача — 179 мс. Размер JSON 52,25 MiB не равен числу байтов транспорта или peak памяти. Замер передачи включает structured clone и планирование; timestamps добавляет только benchmark-обёртка. Worker завершается при результате, ошибке и таймауте. Main JS heap не учитывает worker, WASM, native/GPU. Большие реальные IFC и устройства с малой памятью не измерялись.

Проверки охватывают WebIFC engineering fixtures, импорт через worker, бинарный IndexedDB roundtrip с изоляцией/удалением по проекту, закрытие и повторное открытие viewer, существующие emulator-тесты публикации/reader fencing. Parser закрывает модель в finally, viewer освобождает engine при замене/закрытии. Parser, протокол worker, схема Firestore, ревизии, epoch, leases и GC не менялись.

Полный каталог метаданных остаётся. Потоковая геометрия, переделка передачи worker и постоянный индекс нескольких проектов не вводились: замеры обосновывают локальную оптимизацию сортировки/поиска, но не миграцию данных. Перед увеличением допускаемого масштаба нужен бюджет памяти целевого устройства. Поэтому исходный риск полной памяти каталога остаётся частично открытым.
