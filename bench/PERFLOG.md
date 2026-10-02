# PERFLOG — журнал изменений производительности

Канонический лог всех измерений рендер-ядра и правил его пополнения. Каждая фаза оптимизации
(M0–M7 из плана «рендер-ядро до 4096²») обязана оставлять здесь строку: **что измерили → сколько
было → сколько стало → на сколько процентов → что именно изменило**. Проценты считаются от
baseline M0 (таблицы ниже), не от предыдущей фазы.

> **Language note (repo policy, 2026-10-01):** historical entries in this log are in Russian;
> every new entry must be written in English. See `docs/README.md` for the documentation
> language policy.

## Как воспроизвести замеры

**Engine (node, детерминированный, основной для фаз M1/M4/M6):**

```bash
npm run bench                # прогон, JSON пишется в bench/results/engine-bench.json
npx vitest bench --run --compare bench/results/engine-bench.json
                             # то же + колонки дельты против сохранённого отчёта
```

Сценарии живут в `src/engine/*.bench.ts`, общие фикстуры — `src/engine/bench-doc.util.ts`.
Фикстуры детерминированы (mulberry32): каждый прогон рисует побитово одинаковые чернила.
Размеры 2048²/4096² строятся напрямую в обход `MAX_SIZE` — это замер сегодняшнего движка на
гипотетических холстах.

**Браузер (реальные кадры, фазы M2/M3/M5):**

```bash
npm run dev                  # → http://localhost:5174
# открыть http://localhost:5174/?bench=1&autorun=1 и дождаться «done»
```

Харнесс монтирует настоящий `CanvasStage` на том же сторе и гоняет сценарии: loadDoc, commit
штриха, шаг зума колесом, e2e-штрих синтетическим указателем, undo. Кнопки «copy json» /
«download» выгружают отчёт (он же `window.__benchReport`); сохранять в
`bench/results/browser-bench-<дата>.json`.

**Метрика браузерного харнесса:** «dispatch → React render + canvas-эффекты завершены»
(MessageChannel-flush, см. `flushEffects` в `bench-scenarios.ts`). Отрисовка кадра (paint) в
замер не входит — это делает числа устойчивыми к окклюзии окна. Поле `framesLive: false` в
отчёте означает, что окно не рисовало кадров и каденция e2e-штриха шла через effect-hops, а не
реальные кадры (такие числа штриха — верхняя оценка и помечаются в логе).

## Окружение baseline (M0)

| Параметр | Engine | Браузер |
| --- | --- | --- |
| Дата | 2026-09-26 | 2026-09-26 |
| Код приложения | `dddaa83` (.engine не менялся) | `dddaa83` |
| Среда | Node v24.7.0, macOS arm64 | ZCode webview: Chromium 146 / Electron 41 |
| Экран/устройство | — | dpr 2, 1280×720, 8 ядер, deviceMemory 8 ГБ |
| Особенности | — | `framesLive: false` (окно без кадров) |

Файлы: `bench/results/engine-bench.json`, `bench/results/browser-bench-2026-09-26.json`.

## Baseline M0 — engine (node, mean)

### buildGeometry — полная пересборка геометрии (сегодня платится на каждом commit/zoom/pan)

| Сценарий | mean | Отношение к 512² |
| --- | --- | --- |
| flat 512², 5% ink | 8.0 мс | 1× |
| flat 512², 15% ink | 19.1 мс | ×2.4 |
| flat 512², 30% ink | 38.2 мс | ×4.8 |
| flat 2048², 5% ink | 129.2 мс | ×16 |
| flat 2048², 15% ink | 338.0 мс | ×42 |
| flat 4096², 5% ink | 478.7 мс | ×60 |
| scene 2048², 100 объектов (~10%) | 65.9 мс | ×8 |

### Кадр штриха и сцена

| Сценарий | mean |
| --- | --- |
| stagingPreview 512², 1500 staged cells | 0.20 мс |
| stagingPreview 4096², 1500 staged cells | 0.20 мс |
| syncDoc (composite rebuild) 512², 50 объектов | 0.23 мс |
| syncDoc (composite rebuild) 2048², 100 объектов | 3.13 мс |
| commit engine-path 2000 cells, 512² | 0.27 мс |
| commit engine-path 2000 cells, 2048² | 3.05 мс |
| commit engine-path 2000 cells, 4096² | 10.49 мс |

### Persistence и инструменты

| Сценарий | mean |
| --- | --- |
| autosave encode (serialize+stringify) 512² scene | 0.26 мс |
| autosave encode 2048² scene | 1.73 мс |
| load parse (parse+deserialize) 512² scene | 0.87 мс |
| load parse 2048² scene | 1.44 мс |
| cells.slice() 4096² (32 МБ) | 2.82 мс |
| cellObj.slice() 4096² (64 МБ) | 6.16 мс |
| floodFillDoc 512² (~7% регион) | 0.51 мс |
| floodFillDoc 2048² (~7% регион) | 9.43 мс |
| symmetryPoints ×2000: mirrorX / quad / diag8 | 0.18 / 0.27 / 0.52 мс |
| symmetryPoints ×2000: p4 (repeat 16) | 499.3 мс |

## Baseline M0 — браузер (median, dispatch → effects)

| Сценарий | 512² | 2048² | 4096² | Бюджет-цель (4096²) |
| --- | --- | --- | --- | --- |
| loadDoc | 108 мс | 822 мс | 2680 мс | < 1000 мс |
| commit 2000 cells | 54.8 мс | 173 мс | 583 мс | < 16 мс |
| wheel zoom step | 7.2 мс | 15.6 мс | 5.3 мс | < 8 мс |
| pencil stroke e2e ×60 | 255 мс | 476 мс | 852 мс | p95 < 8 мс/кадр |
| undo | 28.7 мс | 160 мс | 557 мс | — |

Штрих на `framesLive: false` — каденция через effect-hops, числа завышены против реальной
покадровой работы; сравнить после M2 на видимом окне.

## Что говорит baseline (стартовые гипотезы для фаз)

- **Масштабирование геометрии строго O(площадь×ink)**: 512²→4096² при тех же 5% чернил — ровно
  ×60. Каждый commit/zoom/pan платит эту таксу; при 4096² commit браузера 583 мс — в ~36 раз
  дороже бюджета кадра. Тайловая модель (M1/M2) + RLE-прогоны (M2) должны превратить её в
  O(изменённые тайлы).
- **stagingPreview уже O(staged)** — 0.20 мс одинаково на 512² и 4096². Это доказанный
  инкрементальный контур, тайловая модель обязана сохранить его свойство для commit/undo/zoom.
- **undo стоит целый рестор документа** (557 мс на 4096²) плюс держит весь буфер на шаг истории —
  патч-undo (M1) убирает и время, и память.
- **p4-симметрия аномальна**: 499 мс против 0.2 мс у mirrorX на 2000 точек (орбита решётки до
  MAX_ORBIT=4096 на каждый штамп). Требует кэша орбит/лимита в M4.
- **zoom step дёшев по эффектам** (5–16 мс), потому что арт-битмап перерисовывается только
  текущий вьюпорт — но при видимом окне сюда входит покадровый paint всей геометрии, и на
  4096² он упирается в те же 479 мс сборки путей. Реальную стоимость зума замерить после M2
  (тайловый растровый кэш) на видимом окне.
- **Persistence-кодирование мало** (сцена сериализуется разреженно), но оно целиком на главном
  потоке каждые 800 мс — воркер + IndexedDB (M3).

## Журнал изменений

Формат: одна строка на одно измеренное изменение. «До» — медиана/mean из предыдущего прогона той
же среды, «Δ%» — от baseline (этот файл). Наполнять сразу после гейтов фазы, ссылка на коммит
обязательна.

| Дата | Фаза | Сценарий (среда) | До | После | Δ% | Что изменило |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-26 | M0 | — baseline зафиксирован — | — | — | — | `dddaa83` + bench-инфраструктура |
| 2026-09-26 | M1 | Лимиты и история (инфраструктура, без таймингов) | — | — | — | `MAX_SIZE=4096`, `MAX_CELLS=16.7M` + `fitSub` (произведение size×sub), пресеты до 4096², диалог импортирует `MAX_SIZE` вместо хардкода 512, бюджет истории 256 МБ с полом 2 шага (был 32 МБ с полом 8 — при sub3 512² глубина выросла 8→18, при 4096² память ограничена ~192 МБ) |
| 2026-09-26 | M2a | buildGeometry scene 2048², 100 objs (node) | 65.9 мс | 40.4 мс | **−39%** | RLE-слияние горизонтальных прогонов same-value ячеек в один rect-фрагмент; включается при радиусах 0, без текстуры, sizeX/Y=1; округлённые/текстурные стили идут по прежнему per-cell пути (тесты `geometry-runs.test.ts`) |
| 2026-09-26 | M2a | buildGeometry flat 4096², 50% runs-64 (node) | ~5000 мс¹ | 91.5 мс | **−98%** | то же; ¹оценка старого per-cell по линейной стоимости фрагмента из scatter-5% (840K фрагментов = 510 мс; здесь 8.4M ячеек) |
| 2026-09-26 | M2a | buildGeometry flat 512², 50% runs-64 (node) | ~78 мс¹ | 1.13 мс | **−99%** | то же |
| 2026-09-26 | M2a | buildGeometry flat 512², 5% scatter (node, худший случай) | 8.0 мс | 6.7 мс | −16% | то же; на рассеянных чернилах прогоны редки — регрессии нет |
| 2026-09-26 | M2b | Кадр штриха без React (архитектура) | ре-рендер 1443-строчного компонента на каждый кадр штриха | прямая отрисовка base+overlay из staging-rAF | — | staging-rAF вызывает `drawBaseRef`/`drawOverlayRef` вместо reducer-тика; hover обновляется только при смене ячейки (функциональный updater); React рендерит стадию только на commit/zoom/doc |
| 2026-09-26 | M4a | symmetryPoints p4 ×2000 с полной орбитой (node) | 393.8 мс | 6.4 мс (с штамп-лимитом 64) | **−98%** | `symmetryPoints(limit)`: перечисление решётки short-circuit по бюджету орбиты вместо slice после полного обхода (MAX_ORBIT=4096 точек) |
| 2026-09-26 | M4a | blobCells (гекс/три/радиаль кисть) | O(size⁴) рост на каждый штамп | кэш блобов по (grid, anchor, count), cap 1024 | — | детерминированный результат — кэш прозрачен для call-site |
| 2026-09-26 | M1+M2a | Браузер: loadDoc 4096² | 2680 мс | 158 мс | **−94%** | RLE-геометрия + fit-вью в харнессе (старый прогон растеризовал битмап в застывшем зуме — часть дельты харнесс-эффект) |
| 2026-09-26 | M1+M2a | Браузер: commit 2000 cells 4096² | 583 мс | 130 мс | **−78%** | RLE-геометрия; остаток — composite+геометрия всего холста (полная тайловая модель M1-полн — следующий рычаг до бюджета 16 мс) |
| 2026-09-26 | M1+M2a | Браузер: undo 4096² | 557 мс | 122 мс | **−78%** | то же |
| 2026-09-26 | M1+M2a | Браузер: zoom step (все размеры) | 3–7 мс | 3–4 мс | ✓ бюджет 8 мс | эффекты зума O(вьюпорт); с живыми кадрами (framesLive=true) держит 60 fps |
| 2026-09-26 | M2b | Браузер: штрих e2e ×60 (framesLive=true) | — | ~2010–2133 мс на 60 кадров (~33 мс/кадр, 2 rAF каденции харнесса) | размер-независим | +6% времени на 64× площадь холста: работа кадра O(staged cells) сохранена и при живых кадрах |
| 2026-09-26 | M3 | Autosave: localStorage → IndexedDB + debounce 800→2000 мс | stringify каждые 800 мс + тихая потеря >5 МБ квоты | async IDB-запись, localStorage только для ≤2 МБ (синхронная загрузка) | квота снята | `storage/autosave.ts` (store `autosave`, схема v5); на загрузке IDB-гидрация, если localStorage пуст; clean-check пропускает двойной stringify для буферов >1M ячеек |
| 2026-09-26 | M4b | evalGraph мемоизация (архитектура) | граф-объекты считались дважды на каждый rebuild (composite + geometry) | `evalGraphMemo`: WeakMap по (graph, input ink, baseStyle, dims, palette) identity | — | повторные rebuilds неизменённых параметрических объектов переиспользуют результат; бенч-фикстуры без графов — эффект виден в профилировщике граф-доков |
| 2026-09-26 | M5 | WebGPU-рендер — отложен | — | — | — | профилирование: зум-эффекты уже 3–4 мс (бюджет 8 мс) на Canvas 2D; остаток бюджета (коммит 130 мс vs 16 мс) — композит+строки геометрии всего холста, что лечится полной тайловой моделью данных, а не GPU-путём; двойной рендерер без тайлов не даёт parity-гарантий |
| 2026-09-26 | M6 | WASM/Rust-ядра — отложены (тулчейн в системе есть: cargo 1.91/wasm-pack) | — | — | — | горячий путь — сборка path-строк и аллокации композита в JS-куче; числовые ядра (flood 9.4 мс, поле метаболлов, image-ops) — вторичные пути; перенос в WASM станет выгодным после тайловой модели (когда останутся только числовые ядра) |
| 2026-09-27 | vector | trace-движок (новая фича `engine/trace/`, порт vtracer V1) | — | 512² photo spline/stacked ≈ 94–97 мс; 512² bands polygon ≈ 19–50 мс; 2048² bands polygon ≈ 300 мс (node, vitest bench) | baseline | первый замер нового пайплайна (кластеризация NN-chain → трассировка масок → RDP → Schneider-Безье → mosaic/stacked); паритет со структурой официального wasm-оракула — `src/engine/trace/parity.test.ts`; бенчи — `src/engine/trace/trace.bench.ts` |
| 2026-09-27 | home | Ambient autosave (store `autosave` → запись проекта; `storage/autosave.ts` удалён) | IDB-запись черновика каждые 2 с | та же частота, но запись идёт в привязанный `ProjectEntry`; миниатюра ре-рендерится не чаще раза в 30 с (ручной Ctrl+S — всегда) | ~нейтрально | стоимость сериализации не изменилась; доп. цена — `renderThumbnailDataURL` раз в 30 с вместо каждого ручного сейва; векторная сессия пишется в entry с прежним троттлингом 1.5 с (`vector.slice.ts`) |
| 2026-09-29 | forms | buildGeometry flat 512², 5% ink (node): квадрат → круги | 9.1 мс | 13.4 мс | +47% | фича cell-forms (`cell-shapes.ts`): не-квадратная форма выключает RLE-слияние и рисует per-cell фрагменты формы; стоимость того же класса, что радиус≠0 (per-cell строковый путь). Дефолтные квадратные документы не затронуты: быстрый путь и его условие не изменились |
| 2026-09-29 | forms | buildGeometry flat 512², 50% runs-64 (node): квадрат → круги | 1.07 мс | 121.7 мс | ×114 (ожидаемо) | та же фича: формы по определению не сливаются в прогоны (у каждой ячейки свой силуэт) — это цена любого per-cell стиля (радиус≠0 даёт те же ×100+); сценарии `flat 512² … circles` добавлены в `geometry.bench.ts` для слежения |
| 2026-09-30 | lattices | buildGeometry diamond 512², 5% ink (node) против квадратного per-cell пути | ~10.9 мс (квадрат 5% scatter) | 11.6 мс | +6% | новые решётки `diamond/iso/brick/octasquare` (`grids-lattices.ts`) идут через общий per-cell путь `gridBuildGeometry` (как hex сегодня) — сценарии `diamond 512²` и `octasquare 256²` добавлены в `geometry.bench.ts`; квадратный RLE-быстрый путь и его условие не тронуты, повёрнутая сетка (`gridRotation`) также уводится на общий путь, `stagingPreview` на ней возвращает null (контракт в `perf-stress.test.ts`) |
| 2026-09-30 | research | Инфраструктура: новые бенчи `graph` / `render-modes` / `tile-spike` / `style-decompose` / `flood-wasm` + браузерные группы (node drag, param scrub, wheel burst, idle selection) | графы, outline/metaball/texture, плиточность и конкурентность не были покрыты замерами | `docs/research/performance.md` — полный отчёт; свежие чекпоинты `bench/results/engine-bench.json` + `browser-bench-2026-09-30.json` | — | исследование без изменений продакшн-кода: все эксперименты — bench-локальный код (`src/engine/*.bench.ts`, `src/app/bench/bench-scenarios-graph.ts`, `bench/wasm-flood/`) |
| 2026-09-30 | research | Перетаскивание нод-карточки: клон графа (pos внутри Graph) через identity-memo, 4096² (node) | 687–800 мс за тик drag | ~0 при pos вне Graph (memo hit: 17–28 млн хитов/с); syncDoc-коммит 2048²: 96.5 → 5.0 мс (×19) | **−100 %** | вывод: вынести `pos` из семантического графа (layout-map + версия сериализации) — перетаскивание перестаёт платить переоценку графа; браузер (4096², per-tick effects): ≈1.7 с/тик сегодня против ≈4.6 мс/тик у карандашного штриха |
| 2026-09-30 | research | Param scrub: full re-eval vs dirty-suffix (узлы 3–4, префикс закэширован), 4096² (node) | 708–787 мс | 556–651 мс | −21 % | инкрементальность по префиксу даёт лишь ×1.24–1.27: узлы array/ramp сами O(cells) с аллокацией Map на каждом узле; следующий рычаг — типизированные Cells + мемо на узел (цель ≤130 мс) и rAF-коалесинг правок графа |
| 2026-09-30 | research | Tile-спайк: rebuild геометрии 2048² 5% — весь холст vs 4 «грязных» тайла (1.6 % площади, 256×256) | 233.3 мс | 6.3 мс | **−97 %** | O(изменённые тайлы) вместо O(холст): подтверждение тайловой модели как следующего рычага (M1/M5); композит-патч — второй порядок (4.2 → 3.0 мс на 2048²); гейт для имплементации: коммит 4096² ≤ 16 мс при пиксельной идентичности вывода (golden-тесты к `perf-stress.test.ts`) |
| 2026-09-30 | research | Декомпозиция per-cell стилей (круги, 512² 50% runs = 131k ячеек): строки vs пайплайн | пайплайн 195.3 мс | сырая эмиссия строк: 12.6 мс (3-десятичные) / 7.1 мс (integer) / 0.39 мс (stadium на прогон, ~1k фрагментов) | строки ≈ 6 % стоимости | доминируют счётчик фрагментов и generic-механика фрагментов, а не форматирование; кандидаты: merged-forms стиль (×33 к строкам, меняет силуэт — продуктовое решение) или draw-time инстансинг Path2D (нужен браузерный прототип с живыми кадрами); integer-координаты сами по себе дают ~5 % — не оправданы |
| 2026-09-30 | research | Flood fill 2048² (~7 % регион): TS текущий vs TS настроенный vs Rust/wasm-ядро (`bench/wasm-flood/`) | TS 11.0 мс | настроенный TS 3.1 мс; wasm-ядро ≈ 3.2 мс (+0.7 мс копия буфера) | ×3.5 в чистом TS | **решение: остаёмся на TS** — потеря текущей реализации алгоритмическая (per-cell массивы соседей + маска), а не в языке; гейт «≥2× и ≥20 % e2e» не выполнен, M6 (отложено) подтверждён; крейт оставлен для будущих ядер (поле метаболлов, trace) с тем же гейтом |
| 2026-09-30 | research | Браузерный чекпоинт 2026-09-30 (`framesLive: false`, как M0): commit/undo 4096² | commit 130 мс / undo 122 мс (M2a-эра) | 116–191 мс / 100–154 мс | ~без изменений | новые группы: node drag ×6 @4096² = 10.2 с (≈1.7 с/тик), param scrub ×6 = 6.4 с; zoom-step 2.5–4.9 мс и wheel-burst ×10 ≈ 3 мс — пан/зум НЕ узкое место (React батчит view-обновления в одну пересборку); marching-ants под occluded-окном неизмеряем — нужен прогон с живыми кадрами; grain texture 1.7–1.9 с и outline 2048² 0.72–0.89 с за rebuild — «обрыв» fallback-штриха (per-frame полная пересборка) |
| 2026-10-02 | feature | Dither-library expansion: per-algorithm cost of the new heavy algorithms on a 128² sample (`src/engine/dither.bench.ts`, palette 2 colors, 60 ms dialog debounce is the budget) | — (first baseline) | nearest ≈1.0 ms · bayer8 ≈1.6 · hilbert ≈2.0 · floyd ≈2.6 · hybrid (3 band runs) ≈5.3 · yliluoma (mix search) ≈5.8 · cmyk (4 plates) ≈7.9 | baseline | new feature baseline, no regression: the pre-existing geometry/commit benches are untouched; every new algorithm stays ≥7× under the dialog's 60 ms re-run budget; hybrid runs its bands sequentially (×2.6 of a single diffusion run) and cmyk evaluates four rosette plates (×8 of nearest) — both acceptable at import resolution; watch points for future: yliluoma candidate count and halftone lattice point caps (`MAX_SCREEN_POINTS`) |
| 2026-10-02 | hatch | Hatch texture fragments, 128² single-color region (`src/engine/texture-hatch.bench.ts`) | — (first baseline) | halftone grid ≈ 11.4 ms · hatch straight ≈ 39.6 ms · hatch straight + wobble 40 ≈ 50.6 ms · hatch cross ≈ 78.3 ms | baseline | new feature baseline, no regression (add-line-systems): a line scan walks flag tests along every clipped line (~3.5× a halftone dot scan of the same region); waved lines coarsen their sampling step to a 400k flag-test budget (95→51 ms); line-count coarsening (800) and the 6000-strip cap keep worst-case path size bounded — watch points for dense regions |
