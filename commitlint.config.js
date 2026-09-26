// Conventional Commits для Дизерлаба. Пресет задаёт типы (feat, fix, docs, style,
// refactor, perf, test, build, ci, chore, revert), лимит заголовка 100 символов
// и обязательность тела/футера после пустой строки.
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // case-правила темы из пресета рассчитаны на латиницу и ложно ругаются на
    // русские темы (естественно начинающиеся с заглавной) — поэтому выключены.
    'subject-case': [0],
  },
}
