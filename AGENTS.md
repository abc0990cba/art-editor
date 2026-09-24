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

## Структура и границы (проверяется `arch:check`)

```
src/
  app/       # каркас: app.component.tsx, app-top-bar.component.tsx, main.tsx
  features/  # вертикальные модули UI: canvas, tools, nodes-editor, layers,
             # settings-panel, projects, export, import
  engine/    # чистый домен (без React!): doc, scene, shapes, brush, grids, nodes…
  state/     # editor.store.ts (zustand) — единый стор приложения
  storage/   # IndexedDB-персистенция (projects, presets, brushes, db)
  shared/    # кросс-срезовое: ui/ (примитивы), lib/ (утилиты), i18n/
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

## Форматирование — oxfmt

`.oxfmtrc.json` закрепляет всё: 100 колонок, 2 пробела, без точек с запятой, одинарные
кавычки, trailing comma, `sortImports`, `sortTailwindcss`, `jsdoc`, `sortPackageJson`.
Порядок импортов не правится руками — только через oxfmt.
