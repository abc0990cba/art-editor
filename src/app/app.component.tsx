import { RouterProvider } from '@tanstack/react-router'

import { I18nProvider } from '../shared/i18n/i18n.provider.tsx'
import { router } from './router.tsx'

/**
 * App shell: i18n + the router. The routes own the surfaces — `/` renders the home screen (project
 * gallery), `/p/$projectId` the editor for the opened project's workspace kind.
 */
export default function App() {
  return (
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  )
}
