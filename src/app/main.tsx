import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../index.css'
import { TooltipProvider } from '../shared/ui/shadcn/tooltip.tsx'
import App from './app.component.tsx'

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
