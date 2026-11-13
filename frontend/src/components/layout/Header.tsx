// Fixed header — brand + workspace tabs + catalog search, theme/effects on the
// right, and (for the gallery) a hover-reveal strip with the view controls.
import { useStore } from '../../store'
import { THEMES, THEME_LABELS, type Theme } from '../../theme'
import type { Workspace } from '../../types'
import { SearchBar } from '../search/SearchBar'
import { GridToolbar } from './GridToolbar'
import './header.css'

const WORKSPACES: ReadonlyArray<{ id: Workspace; label: string }> = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'timeline', label: 'Timeline' },
]

export function Header({
  railOpen,
  previewOpen,
  onToggleRail,
  onTogglePreview,
}: {
  railOpen: boolean
  previewOpen: boolean
  onToggleRail: () => void
  onTogglePreview: () => void
}) {
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const importing = useStore((s) => s.importing)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const effectsOn = effects === 'full'

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
            title="UI theme"
          >
            {THEMES.map((id) => (
              <option key={id} value={id}>
                {THEME_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

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
      </div>

      {workspace !== 'ingest' && (
        <div className="header-reveal">
          <GridToolbar
            showRail={workspace === 'gallery'}
            railOpen={railOpen}
            previewOpen={previewOpen}
            onToggleRail={onToggleRail}
            onTogglePreview={onTogglePreview}
          />
        </div>
      )}
    </header>
  )
}
