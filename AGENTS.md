# AGENTS.md — конвенции для AI-агентов и людей

Проект: **Дизерлаб** (glyph-editor) — пиксельный/векторный редактор на React 19 + TypeScript + Vite.
Весь код пишется с помощью AI, поэтому настройки максимально строгие: линтер и проверщики границ —
часть фидбэк-лупа, а не украшение.

## Обязательный порядок проверок (фидбэк-луп)

После каждого изменения кода прогоняй по цепочке и чини, пока всё не зелёное:

```bash
npm run format:check   # oxfmt — форматирование (или сразу `npm run format` для записи)
npm run lint           # oxlint — 0 ошибок обязательно; warnings — advisory, см. ниже
npm run arch:check     # dependency-cruiser — границы слоёв/фич, 0 нарушений
npm run knip           # мёртвые экспорты/файлы/зависимости, 0 находок
npx tsc --noEmit       # типы (входит и в `npm run build`)
npm test               # vitest, все тесты зелёные
```

Для машинного вывода линтера в AI-петле: `npm run lint:ai` (токен-минимальный формат oxlint).

⚠️ Не запускай `oxlint --fix` без последующего ревью diff: часть автофиксов
типонебезопасна (история: спред `Uint16Array` → `number[]`, `.at(-1)` → `T | undefined`,
выедание `undefined`-аргументов). Правила-вредители выключены в `.oxlintrc.jsonc` с пометкой.

## Коммиты — Conventional Commits (проверяется на `commit-msg`)

Формат: `<type>(<scope>)?: <subject>` + пустая строка + тело/футер по необходимости.
Пресет `@commitlint/config-conventional`, конфиг `commitlint.config.js`, хук `commit-msg`
(lefthook, конфиг `lefthook.yml`; хуки в `.git/hooks` ставятся `prepare`-скриптом
`lefthook install`).

- Типы: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Заголовок ≤ 100 символов, тема без точки в конце; case-правила темы выключены
  (латиноцентричные, ложно ругаются на кириллицу) — причина в комментарии конфига.
- Ручная проверка текста до коммита: `git log -1 --pretty=%B | npm run --silent commit:check`
  (или `npx commitlint --edit <файл-с-сообщением>`).

Рабочее правило для агентов: **после каждого изменения агент сам предлагает готовый текст
коммита** (тип + тема + тело с описанием того, что произошло) — но коммит делает человек:
агент не запускает `git commit`.

## Структура и границы (проверяется `arch:check`)

```
src/
  app/       # каркас: app.component.tsx, app-top-bar.component.tsx, main.tsx
  features/  # вертикальные модули UI: canvas, tools, nodes-editor, layers,
             # settings-panel, glyph-editor, projects, export, import
  engine/    # чистый домен (без React!): doc, scene, shapes, brush, grids, nodes…
  state/     # editor.store.ts (zustand) — единый стор приложения
  storage/   # IndexedDB-персистенция (projects, presets, brushes, db)
  shared/    # кросс-срезовое: ui/ (примитивы + vendored shadcn), lib/ (утилиты), i18n/
```

Правила зависимостей (`.dependency-cruiser.cjs`):
- `engine` не импортирует ничего выше себя (state/storage/features/shared/app) — исключение:
  `*.test.ts` движка могут поднимать стор для интеграционных сценариев.
- `storage → engine`; `state → engine + storage`; UI-слои не импортируются из state/storage.
- `features → { shared, engine, state, storage }`; **фича → фича запрещена**.
  Единственное исключение: `settings-panel` собирает правую колонку из `layers` и
  `nodes-editor`. Если двум фичам нужен общий код — поднимай его в `shared/`.

Куда что класть: чистая логика пикселей/геометрии/сериализации → `engine`; доступ к IndexedDB →
`storage`; глобальное состояние UI и документа → `state/editor.store.ts`; экранные модули →
`features/<фича>/`; переиспользуемые виджеты → `shared/ui/`.

## UI-слой: shadcn/ui (основа) + дизерлабовские обёртки

Основа UI-слоя — **shadcn/ui** (Tailwind v4, radix-ui, `cn()` из `shared/lib/utils.ts`).

- `shared/ui/shadcn/` — vendored shadcn-компоненты (`button.tsx`, `dialog.tsx`, …) с
  апстрим-именами файлов. Добавление нового: `npx shadcn@latest add <component>` (алиасы в
  `components.json`: ui → `@/shared/ui/shadcn`, utils → `@/shared/lib/utils`). Папка исключена
  из knip (`knip.json`) и нейминг-правил; oxlint-override глушит апстрим-стиль
  (prop-spreading, namespace-imports). Правки вручную — только задокументированные адаптации:
  `bg-muted` → `bg-chip` (у нас `--muted` — цвет вторичного текста), в `tooltip.tsx`
  инвертированный `bg-foreground`/`text-background` → `bg-popover`/`text-popover-foreground`
  (инверсия выглядит как белые плашки на тёмных темах), импорт `cn` уже переписан
  на `@/shared/lib/utils`; в `dialog.tsx` контент ниже `lg` — полноэкранный лист (нативные
  мобильные модалки), `lg:` возвращает центрированную модалку, проп `centered` выключает лист
  для мелких подтверждений; в `slider.tsx` и `select.tsx` на `max-lg` увеличены бегунок/трек
  и строки списков (правило 44px).
- Мобильные модалки: контентные диалоги на телефонах/планшетах (<1024px) всегда полноэкранные —
  десктоп-габариты (max-w/max-h/rounded) задаются только `lg:`-классами. `ConfirmDialog` —
  исключение (центрированный алерт).
- `shared/ui/index.tsx` и соседние `*.component.tsx` — **публичные примитивы проекта**
  (`Chip`, `IconButton`, `Tooltip`, `Slider`, `CheckRow`, `TextField`, `ConfirmDialog`,
  `Section`): фичи используют только их, не shadcn напрямую. Обёртки фиксируют
  дизерлабовские размеры (чипы 28px, тип 10–11px) поверх shadcn-примитивов.
- Темы: дизерлабовские токены (`--app`, `--panel`, `--chip`, …) — источник истины; shadcn-имена
  (`--background`, `--card`, `--primary`, `--ring`, …) выведены из них в каждом из пяти
  тематических блоков `src/index.css` (`@theme inline` маппит оба набора). Новый цвет —
  добавляй в оба набора во всех пяти темах.
- Новые модалки — на shadcn `Dialog` (Escape/фон/фокус-ловушка из коробки); подтверждения —
  `ConfirmDialog` (рендерится поверх модалок, z-60). `TooltipProvider` смонтирован один раз в
  `main.tsx`.

## Именование файлов (проверяется `unicorn/filename-case` = kebabCase)

`<kebab-base>.<тип>.<расширение>`:

| Суффикс | Для чего | Пример |
|---|---|---|
| `.component.tsx` | React-компонент | `canvas-stage.component.tsx` |
| `.hook.ts` | хук (`useXxx`) | `use-media-query.hook.ts` |
| `.store.ts` | стор | `editor.store.ts` |
| `.provider.tsx` | React-контекст/провайдер | `i18n.provider.tsx` |
| `.messages.ts` | словари локализации | `ru.messages.ts` |
| `.util.ts` | чистые утилиты | `file-download.util.ts` |
| `.node.ts` | семейство нод движка | `sources.node.ts` |
| `.test.ts` | тесты, колокация рядом с кодом | `shapes.test.ts` |
| `index.ts(x)` | баррель (единственное имя без суффикса) | `shared/ui/index.tsx` |

Модули `engine` (кроме нод) — просто kebab-case без суффикса: `shapes.ts`, `doc.ts`.
Исключение из суффиксов: `shared/ui/shadcn/*` — vendored файлы shadcn/ui сохраняют апстрим-имена
(`button.tsx`, `dialog.tsx`); их имена не редактируем (перегенерация CLI).

## Лимиты размера кода (ratchet)

Глобальные пороги (error, для всего нового кода):

| Правило | Лимит |
|---|---|
| `eslint/max-lines` | **400 строк** файла (без комментариев/пустых) |
| `eslint/max-lines-per-function` | **150 строк** |
| `eslint/complexity` | 20 |
| `eslint/max-statements` | 60 |
| `eslint/max-depth` | 4 |
| `eslint/max-params` | 5 |

Легаси-файлы, не влезающие в пороги, **заперты храповиком** в `overrides` секции
`.oxlintrc.jsonc`: каждому задан cap = текущий размер + 2. Расти нельзя (новые строки
уложат в лимит и lint упадёт); уменьшил файл — уменьши и его cap в override (или убери
override, когда файл вписывается в глобальные пороги). Исключения: `*.messages.ts`
(файлы-данные локализации) — свободный лимит; тесты — cap по фактическому размеру.

Разбитые (не увеличивать!): `editor.store` → слайсы `state/*.slice.ts` (в сторе осталась
только композиция), `shapes` → фасад + `shape-*.ts`, `import-image` → фасад +
`import-*.ts`, `texture` → баррель + `texture-*.ts`, `presets` → `preset-*.ts`,
`app-top-bar` → `top-bar-*.component.tsx`. Ещё ждут разделения: `canvas-stage` 2439,
`tool-rail` 1334, `node-editor-canvas` 1233, `settings-panel` 1170, `geometry` 827,
`scene` 802, `symmetry` 619, `fillpatterns` 559, `grids` 549, `doc` 527, `project` 485,
`palettes` 455, `app.component` 482 — разбивай по фичам/слоям согласно структуре выше.

## TypeScript — жёсткий профиль

`strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch` +
`noUncheckedSideEffectImports` + `verbatimModuleSyntax` (всегда `import type`) +
`noImplicitOverride` + `noPropertyAccessFromIndexSignature` (обращение к index-сигнатурам —
только `obj['key']`) + `forceConsistentCasingInFileNames`.

Отложено осознанно (включить, когда будет окно на рефакторинг):
- `noUncheckedIndexedAccess` — 1390 ошибок на текущем коде; цель №1.
- `exactOptionalPropertyTypes` — конфликтует с React 19-пропсами (~1500 мест).

## oxlint — категории и смысл

`.oxlintrc.jsonc`: `correctness` + `suspicious` + `pedantic` = **error**, `style` +
`restriction` = **warn**. Каждый выключенный правило имеет комментарий-причину (домен:
геометрия/пиксели, битовые операции, мутации в горячих путях). react-hooks-правила
(`exhaustive-deps`, `memo-dependencies`) — **advisory**: читай их при каждом ревью; в
`canvas-stage.component.tsx` «лишние» зависимости — намеренные замыкания горячих путей.

## Дизайн-конвенции и ревью UI

`.zcode/skills/design-conventions/SKILL.md` — метрики лейаута, тач-цели, токены цветов,
z-index, брейкпоинты, редакторские паттерны (все значения измерены с кода).
`.zcode/skills/design-review/SKILL.md` — чеклист ревью UI-изменений (прогонять после
кодового гейта перед отдачей изменения пользователю). Любой UI-код обязан соответствовать.

## Форматирование — oxfmt

`.oxfmtrc.json` закрепляет всё: 100 колонок, 2 пробела, без точек с запятой, одинарные
кавычки, trailing comma, `sortImports`, `sortTailwindcss`, `jsdoc`, `sortPackageJson`.
Порядок импортов не правится руками — только через oxfmt.

## Производительность: bench + PERFLOG

Baseline и журнал изменений производительности — `bench/PERFLOG.md`. Каждое перф-изменение
обязано оставить там строку: метрика → до → после → Δ% → причина (коммит/файлы).

```bash
npm run bench        # vitest bench по движу → bench/results/engine-bench.json
npx vitest bench --run --compare bench/results/engine-bench.json   # + колонки дельт
```

Браузерный харнесс реальных кадров: `npm run dev` → `http://localhost:5174/?bench=1&autorun=1`
(CanvasStage на живом сторе: loadDoc / commit / zoom / e2e-штрих / undo; отчёт —
`window.__benchReport`, кнопки copy/download на панели). Метрика — dispatch → effects complete
(устойчива к окклюзии окна), флаг `framesLive` помечает прогоны без живых кадров.

Лимиты холста: `MAX_SIZE = 4096`, буфер ≤ `MAX_CELLS = 16_777_216` ячеек — `fitSub` понижает
суб-детализацию при превышении произведения `size × sub`. Пиксельная геометрия (радиусы 0, без
текстуры, sizeX/Y = 1) автоматически сливает прогоны в RLE-прямоугольники (`geometry-shape.ts`);
округлённые/текстурные стили идут прежним per-cell путём. Рэгресс-рэтчеты —
`perf-stress.test.ts` (отношения стоимости, не абсолютные времена).
