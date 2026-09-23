/** Timestamped file name stub shared by every download action: glyph-2026.09.21-14-05-03. */
export function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', '-').replaceAll(':', '')
}

/** Trigger a browser download for a blob and revoke the object URL afterwards. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
