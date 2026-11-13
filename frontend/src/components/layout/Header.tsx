// Fixed header — brand + workspace tabs on the left, theme toggle on the right.
import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { Workspace } from '../../types'
import './header.css'

type Theme = 'dark' | 'light'

const WORKSPACES: ReadonlyArray<{ id: Workspace; label: string }> = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'timeline', label: 'Timeline' },
]

export function Header() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('gildex-theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('gildex-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const importing = useStore((s) => s.importing)
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const isDark = theme === 'dark'
  const effectsOn = effects === 'full'

  return (
    <header className="app-header chrome">
      <span className="app-brand display" aria-hidden="true">
        gildex
      </span>

      <nav className="workspace-tabs" aria-label="Workspaces">
        {WORKSPACES.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`workspace-tab${tab.id === workspace ? ' is-active' : ''}${
              tab.id === 'ingest' && importing ? ' is-busy' : ''
            }`}
            aria-current={tab.id === workspace ? 'page' : undefined}
            onClick={() => setWorkspace(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <span className="header-spacer" />

      <button
        type="button"
        className={`effects-toggle${effectsOn ? ' is-on' : ''}`}
        onClick={() => setEffects(effectsOn ? 'reduced' : 'full')}
        aria-pressed={effectsOn}
        title={effectsOn ? 'Reduce effects' : 'Restore effects'}
        aria-label={effectsOn ? 'Reduce effects' : 'Restore effects'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3 20 9.5 12 21 4 9.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M4 9.5h16M12 3l3.2 6.5L12 21 8.8 9.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.7"
          />
        </svg>
        {!effectsOn && <span className="effects-slash" aria-hidden="true" />}
      </button>

      <button
        type="button"
        className="theme-toggle"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </header>
  )
}
