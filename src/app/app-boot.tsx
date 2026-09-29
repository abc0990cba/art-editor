import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { TooltipProvider } from '../shared/ui/shadcn/tooltip.tsx'

import '../index.css'
import { seedDemoProject } from '../storage/demo-seed.ts'
import { migrateLegacySession } from '../storage/migrate.ts'
import App from './app.component.tsx'

// adopt pre-home sessions (legacy autosave draft → library project, dead glyph.mode) and seed the
// first-launch demo poster before the first route renders, so the home screen and Continue card
// never see unclaimed state and a fresh client lands on a live example
void migrateLegacySession()
  .then(() => seedDemoProject())
  .finally(() => {
    createRoot(document.querySelector('#root')!).render(
      <StrictMode>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </StrictMode>,
    )
  })
