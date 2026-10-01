/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

/**
 * Multi-page build: the static landing pair (`/`, `/en/`) plus the editor SPA at `/editor`. Dev,
 * preview and production hosting all map `/editor` and `/editor/*` onto `editor.html` (production
 * rewrites ship as public/_redirects + vercel.json) — no global SPA fallback, unknown paths keep
 * returning real 404s.
 */
function editorPageRewrites(): Plugin {
  const rewrite = (req: Connect.IncomingMessage): void => {
    const url = req.url ?? ''
    const path = url.split('?')[0]
    if (path === '/editor' || path.startsWith('/editor/')) {
      req.url = `/editor.html${url.slice(path.length)}`
    }
  }
  const middleware = (req: Connect.IncomingMessage, _res: unknown, next: () => void): void => {
    rewrite(req)
    next()
  }
  return {
    name: 'editor-page-rewrites',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

const page = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss(), editorPageRewrites()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        en: page('en/index.html'),
        editor: page('editor.html'),
      },
    },
  },
  test: {
    benchmark: {
      include: ['src/**/*.bench.ts'],
      outputJson: './bench/results/engine-bench.json',
    },
  },
})
