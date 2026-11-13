// UI theme registry. One style-token pack per theme; the app shell is shared.
// Resolution order: ?theme= query → localStorage → gilded.
export const THEMES = ['gilded', 'dark-bento', 'sage', 'copper'] as const

export type Theme = (typeof THEMES)[number]

export const THEME_LABELS: Record<Theme, string> = {
  gilded: 'Gilded ocean',
  'dark-bento': 'Dark bento',
  sage: 'Scandinavian sage',
  copper: 'Ivory copper',
}

const STORAGE_KEY = 'gildex-ui-theme'
const DEFAULT_THEME: Theme = 'gilded'

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

export function resolveTheme(): Theme {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('theme')
    if (isTheme(fromUrl)) return fromUrl
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isTheme(saved)) return saved
  } catch {
    /* ignore storage / URL failures */
  }
  return DEFAULT_THEME
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore quota / privacy failures */
  }
}

export function syncThemeUrl(theme: Theme): void {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('theme', theme)
    window.history.replaceState(null, '', url)
  } catch {
    /* ignore history failures */
  }
}

export const initialTheme = resolveTheme()
applyTheme(initialTheme)
