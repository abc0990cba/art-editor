/**
 * Entry dispatcher: the regular editor boot, or the ?bench=1 performance harness (dev tool, see
 * bench/PERFLOG.md). Both branches load dynamically so the bench page never pays for app module
 * side effects (and vice versa).
 */
const params = new URLSearchParams(window.location.search)
if (params.has('bench')) void import('./bench/bench-main.tsx')
else void import('./app-boot.tsx')
