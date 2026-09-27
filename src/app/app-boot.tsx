import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { TooltipProvider } from '../shared/ui/shadcn/tooltip.tsx'

import '../index.css'
import { migrateLegacySession } from '../storage/migrate.ts'
import App from './app.component.tsx'

// adopt pre-home sessions (legacy autosave draft → library project, dead glyph.mode) before the
// first route renders, so the home screen and Continue card never see unclaimed state
void migrateLegacySession().finally(() => {
  createRoot(document.querySelector('#root')!).render(
    <StrictMode>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </StrictMode>,
  )
})
