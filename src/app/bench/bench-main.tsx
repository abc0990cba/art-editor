import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../../index.css'
import { CanvasStage } from '../../features/canvas/canvas-stage.component.tsx'
import { I18nProvider } from '../../shared/i18n/i18n.provider.tsx'
import { TooltipProvider } from '../../shared/ui/shadcn/tooltip.tsx'
import { BenchReportPanel } from './bench-report.component.tsx'
import { runBenchScenarios, type BenchReportData } from './bench-scenarios.ts'

/**
 * ?bench=1 performance harness: mounts the real CanvasStage (same store, same render pipeline)
 * without the app shell dialogs, runs the browser bench scenarios and shows the report. Dev tool
 * only — see bench/PERFLOG.md for the ritual and baselines.
 */
function BenchApp() {
  const [report, setReport] = useState<BenchReportData | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const started = useRef(false)

  const run = useCallback(async () => {
    setRunning(true)
    try {
      setReport(await runBenchScenarios(setProgress))
    } catch (error) {
      setProgress(`failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (new URLSearchParams(window.location.search).has('autorun')) void run()
  }, [run])

  return (
    <div className="bg-app text-body flex h-dvh flex-col select-none">
      <div className="relative flex min-h-0 flex-1">
        <CanvasStage onDropFile={() => {}} />
      </div>
      <BenchReportPanel
        report={report}
        running={running}
        progress={progress}
        onRun={() => void run()}
      />
    </div>
  )
}

createRoot(document.querySelector('#root')!).render(
  <I18nProvider>
    <TooltipProvider>
      <BenchApp />
    </TooltipProvider>
  </I18nProvider>,
)
