/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // engine — чистое ядро: не знает ни о сторе, ни о хранении, ни об UI
    {
      name: 'engine-is-pure',
      comment: 'Движок (домен) не может импортировать состояние, хранилище, фичи, UI или каркас.',
      severity: 'error',
      from: { path: '^src/engine', pathNot: '\\.test\\.tsx?$' },
      // интеграционные тесты движка (*.test.ts) поднимают стор ради реальных сценариев — задокументировано в AGENTS.md
      to: { path: '^src/(state|storage|features|shared|app)' },
    },
    // storage — только движок и свои соседи по папке
    {
      name: 'storage-only-engine',
      severity: 'error',
      from: { path: '^src/storage' },
      to: { path: '^src/(state|features|shared|app)' },
    },
    // state — движок и хранилище, но не UI
    {
      name: 'state-no-ui',
      severity: 'error',
      from: { path: '^src/state' },
      to: { path: '^src/(features|shared|app)' },
    },
    // фичи не импортируют друг друга — общее поднимается в shared
    {
      name: 'features-no-cross-imports',
      comment: 'Горизонтальные связи между фичами запрещены, общее поднимается в shared. Исключение: settings-panel собирает правую колонку (layers, nodes-editor) — задокументировано в AGENTS.md.',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/', pathNot: '^src/features/settings-panel/' },
      to: { path: '^src/features/', pathNot: ['^src/features/$1/', '^src/features/settings-panel/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx'] },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
