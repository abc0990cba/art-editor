import { useState } from 'react'

import type { BenchReportData } from './bench-scenarios.ts'

/**
 * Dev-only overlay panel for the ?bench=1 harness: shows scenario results, exposes the JSON report
 * (also on window.__benchReport) and lets the runner download/copy it for bench/PERFLOG.md.
 */
export function BenchReportPanel({
  report,
  running,
  progress,
  onRun,
}: {
  report: BenchReportData | null
  running: boolean
  progress: string
  onRun: () => void
}) {
  const [copied, setCopied] = useState(false)

  const download = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `browser-bench-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copy = async () => {
    if (!report) return
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const fmt = (ms: number) => (ms >= 100 ? `${Math.round(ms)}ms` : `${ms.toFixed(1)}ms`)

  return (
    <div className="bg-panel border-line pointer-events-auto fixed bottom-3 left-3 z-50 max-h-[70dvh] w-[420px] overflow-auto rounded-xl border p-3 font-mono text-[11px] shadow-2xl">
      <div className="text-body mb-2 flex items-center justify-between">
        <span className="text-muted tracking-wider uppercase">canvas bench</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={running}
            onClick={onRun}
            className="bg-chip hover:bg-chip-active text-body rounded-md px-2 py-1 disabled:opacity-40"
          >
            {running ? 'running…' : 'run'}
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={copy}
            className="bg-chip hover:bg-chip-active text-body rounded-md px-2 py-1 disabled:opacity-40"
          >
            {copied ? 'copied' : 'copy json'}
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={download}
            className="bg-chip hover:bg-chip-active text-body rounded-md px-2 py-1 disabled:opacity-40"
          >
            download
          </button>
        </div>
      </div>
      {progress && <div className="text-muted mb-2">{progress}</div>}
      {report && (
        <div className="flex flex-col gap-2">
          {report.groups.map((g) => (
            <div key={g.group}>
              <div className="text-body mb-0.5">{g.group}</div>
              {g.points.map((p) => (
                <div key={p.name} className="text-muted flex justify-between gap-2 pl-2">
                  <span className={p.ok ? '' : 'text-destructive'}>
                    {p.name}
                    {p.note ? ` — ${p.note}` : ''}
                  </span>
                  <span className="text-body shrink-0 tabular-nums">
                    med {fmt(p.median)} · p95 {fmt(p.p95)} · n{p.n}
                  </span>
                </div>
              ))}
            </div>
          ))}
          <div className="text-muted border-line border-t pt-1">
            dpr {report.dpr} · cores {report.cores} · viewport {report.viewport}
          </div>
        </div>
      )}
    </div>
  )
}
