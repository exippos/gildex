// Fixed header — brand + file menu + workspace tabs + catalog search, theme/effects
// on the right.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { THEMES, THEME_LABELS, THEME_SHORT_LABELS, type Theme } from '../../theme'
import type { Workspace } from '../../types'
import { SearchBar } from '../search/SearchBar'
import './header.css'

const WORKSPACES: ReadonlyArray<{ id: Workspace; label: string }> = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'timeline', label: 'Timeline' },
]

export function Header() {
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const importing = useStore((s) => s.importing)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const effectsOn = effects === 'full'
  const openLibraryModal = useStore((s) => s.openLibraryModal)
  const openSettings = useStore((s) => s.openSettings)
  const library = useStore((s) => s.library)
  const librarySettings = useStore((s) => s.librarySettings)
  const updateSettings = useStore((s) => s.updateSettings)

  const blurNsfw = librarySettings.blurNsfw
  const toggleNsfw = () => {
    void updateSettings({ blurNsfw: !blurNsfw }).catch(() => {
      /* keep the header quiet on failure */
    })
  }

  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const fileMenuRef = useRef<HTMLDivElement | null>(null)

  // Close the file menu on an outside click or Escape while it is open.
  useEffect(() => {
    if (!fileMenuOpen) return
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && fileMenuRef.current?.contains(target)) return
      setFileMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFileMenuOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [fileMenuOpen])

  const pickLibraryAction = (mode: 'create' | 'open') => {
    setFileMenuOpen(false)
    openLibraryModal(mode)
  }

  return (
    <header className="app-header chrome">
      <div className="header-main">
        <span className="app-brand display" aria-hidden="true">
          <span className="brand-marks">
            <span className="brand-mark brand-mark--gilded">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                <polygon points="12,2 22,12 12,22 2,12" />
                <circle cx="12" cy="12" r="4.5" />
                <line x1="12" y1="2" x2="12" y2="7.5" />
                <line x1="12" y1="16.5" x2="12" y2="22" />
                <line x1="2" y1="12" x2="7.5" y2="12" />
                <line x1="16.5" y1="12" x2="22" y2="12" />
              </svg>
            </span>
            <span className="brand-mark brand-mark--dark-bento">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="4" width="16" height="16" />
                <rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="brand-mark brand-mark--sage">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="12" y="2" width="14.14" height="14.14" transform="rotate(45 12 2)" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="brand-mark brand-mark--copper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="12" y="2" width="14.14" height="14.14" transform="rotate(45 12 2)" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
            </span>
          </span>
          gildex
        </span>

        <div className="file-menu" ref={fileMenuRef}>
          <button
            type="button"
            className={`file-menu-button${fileMenuOpen ? ' is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={fileMenuOpen}
            onClick={() => setFileMenuOpen((open) => !open)}
          >
            Library
            <span className="file-menu-caret" aria-hidden="true" />
          </button>
          {fileMenuOpen && (
            <div className="file-menu-list" role="menu" aria-label="Library">
              <button
                type="button"
                className="file-menu-item"
                role="menuitem"
                onClick={() => pickLibraryAction('create')}
              >
                New library…
              </button>
              <button
                type="button"
                className="file-menu-item"
                role="menuitem"
                onClick={() => pickLibraryAction('open')}
              >
                Open library…
              </button>
            </div>
          )}
        </div>

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

        {workspace !== 'ingest' && (
          <div className="header-search">
            <SearchBar />
          </div>
        )}

        <span className="header-spacer" />

        <label className="theme-picker">
          <select
            className="theme-picker-select"
            value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}
            aria-label="UI theme"
            title={THEME_LABELS[theme]}
          >
            {THEMES.map((id) => (
              <option key={id} value={id} title={THEME_LABELS[id]}>
                {THEME_SHORT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`nsfw-toggle${blurNsfw ? ' is-on' : ''}`}
          onClick={toggleNsfw}
          disabled={!library?.rootSet}
          aria-pressed={blurNsfw}
          title={blurNsfw ? 'Blur NSFW: on' : 'Blur NSFW: off'}
          aria-label={blurNsfw ? 'Turn off NSFW blur' : 'Turn on NSFW blur'}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {blurNsfw && <span className="nsfw-slash" aria-hidden="true" />}
        </button>

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
          className="settings-toggle"
          onClick={() => openSettings()}
          aria-label="Settings"
          title="Settings"
          aria-haspopup="dialog"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  )
}
