// Small presentation formatters shared by the browse surface.
// No state, no fetching — just display strings.

export function formatTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** "Nov 12 · 14:02–15:40" for same-day ranges, otherwise a date span. */
export function formatRange(start: number, end: number): string {
  if (!Number.isFinite(start) || !Number.isFinite(end) || (start <= 0 && end <= 0)) return ''
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (a <= 0) return formatDate(b)
  const da = new Date(a)
  const db = new Date(b)
  const sameDay =
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  if (sameDay) return `${formatDate(a)} · ${formatTime(a)}–${formatTime(b)}`
  const sameYear = da.getFullYear() === db.getFullYear()
  const left = sameYear
    ? formatDate(a)
    : da.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  return `${left} – ${formatDate(b)}`
}

export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  return new Date(ts).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
