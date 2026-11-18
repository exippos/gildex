// Settings modal — one flat panel with a fixed section nav on the left and a
// single scrollable section on the right. Reads `settingsModal` from the store;
// the orchestrator mounts it while that value is set, and it renders nothing
// when closed. Every preference here saves immediately.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { THEMES, THEME_LABELS, type Theme } from '../../theme'
import type { SettingsSection } from '../../types'
import { SHORTCUTS } from '../shortcuts'
import { SourceManager } from '../sources/SourceManager'
import './settings.css'

type SwatchPalette = { bg: string; surface: string; gilt: string }

// tokens.css scopes the palettes to html[data-theme], so a `data-theme` on the
// swatch alone cannot recolour it. Read the three preview tokens per theme once
// and hand them down as CSS variables — tokens stay the single source of truth.
function readSwatchPalettes(): Partial<Record<Theme, SwatchPalette>> {
  const root = document.documentElement
  const previous = root.getAttribute('data-theme')
  const palettes: Partial<Record<Theme, SwatchPalette>> = {}
  try {
    for (const id of THEMES) {
      root.setAttribute('data-theme', id)
      const style = getComputedStyle(root)
      palettes[id] = {
        bg: style.getPropertyValue('--bg').trim(),
        surface: style.getPropertyValue('--surface').trim(),
        gilt: style.getPropertyValue('--gilt').trim(),
      }
    }
  } finally {
    if (previous === null) root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', previous)
  }
  return palettes
}

const SECTIONS: ReadonlyArray<{ id: SettingsSection; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'library', label: 'Library' },
  { id: 'sources', label: 'Sources' },
  { id: 'tags', label: 'Tags' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function textOrDash(value: string | number | null | undefined): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? String(value) : '—'
  }
  return value && value.trim() ? value : '—'
}

// "120" -> "2 h"; "90" -> "1 h 30 min"; "45" -> "45 min".
function humanizeGap(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours} h ${rest} min`
  if (hours) return `${hours} h`
  return `${rest} min`
}

// Import accepts the canonical export envelope, a bare array of names, or a
// one-per-line text list with '#' comments. Families are part of the name.
function parseTagFile(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown
    try {
      data = JSON.parse(trimmed)
    } catch {
      throw new Error('invalid JSON file')
    }
    let list: unknown[] | null = null
    if (Array.isArray(data)) {
      list = data
    } else if (data && typeof data === 'object') {
      const envelope = data as { tags?: unknown; names?: unknown }
      if (Array.isArray(envelope.tags)) list = envelope.tags
      else if (Array.isArray(envelope.names)) list = envelope.names
    }
    if (!list) throw new Error('no tag list found in JSON')
    return list
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
          return (entry as { name: string }).name
        }
        return ''
      })
      .filter((name) => name.trim() !== '')
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

// Shared empty state for every library-scoped section.
function NoLibrary({ onCreate, onOpen }: { onCreate: () => void; onOpen: () => void }) {
  return (
    <div className="settings-empty">
      <span className="settings-empty-line">no library open</span>
      <p className="settings-hint">
        create a library to manage sources and session clustering, or open an existing .gildex
        bundle.
      </p>
      <div className="settings-actions">
        <button type="button" className="settings-btn settings-primary" onClick={onCreate}>
          Create library…
        </button>
        <button type="button" className="settings-btn" onClick={onOpen}>
          Open library…
        </button>
      </div>
    </div>
  )
}

export function SettingsModal() {
  const section = useStore((s) => s.settingsModal)
  const closeSettings = useStore((s) => s.closeSettings)
  const library = useStore((s) => s.library)
  const librarySettings = useStore((s) => s.librarySettings)
  const updateSettings = useStore((s) => s.updateSettings)
  const reclusterSessions = useStore((s) => s.reclusterSessions)
  const regenerateAllEpisodes = useStore((s) => s.regenerateAllEpisodes)
  const deleteAutoEpisodes = useStore((s) => s.deleteAutoEpisodes)
  const refreshCatalog = useStore((s) => s.refreshCatalog)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const groupClickMode = useStore((s) => s.groupClickMode)
  const setGroupClickMode = useStore((s) => s.setGroupClickMode)
  const thumbnailFit = useStore((s) => s.thumbnailFit)
  const setThumbnailFit = useStore((s) => s.setThumbnailFit)
  const cellSize = useStore((s) => s.cellSize)
  const setCellSize = useStore((s) => s.setCellSize)
  const tags = useStore((s) => s.tags)
  const exportTags = useStore((s) => s.exportTags)
  const importTags = useStore((s) => s.importTags)
  const openLibraryModal = useStore((s) => s.openLibraryModal)

  const [active, setActive] = useState<SettingsSection>(section ?? 'appearance')
  const [gap, setGap] = useState(String(librarySettings.sessionGapMinutes))
  const [threshold, setThreshold] = useState(String(librarySettings.phashThreshold))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tagBusy, setTagBusy] = useState(false)
  const [tagStatus, setTagStatus] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)
  const [blurError, setBlurError] = useState<string | null>(null)
  const [swatches, setSwatches] = useState<Partial<Record<Theme, SwatchPalette>>>({})

  const closeRef = useRef<HTMLButtonElement | null>(null)
  const tagFileRef = useRef<HTMLInputElement | null>(null)

  // The store section can change while the modal is open (menu entry points);
  // clicking the internal nav only moves the local tab.
  useEffect(() => {
    if (section) setActive(section)
  }, [section])

  useEffect(() => {
    if (!section) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section, closeSettings])

  // Move focus into the dialog when it opens and hand it back on close. Keyed
  // on `section` so the modal also behaves if it is mounted unconditionally.
  useEffect(() => {
    if (!section) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => {
      if (previous && previous.isConnected) previous.focus()
    }
  }, [section])

  // Palette previews: measure once the dialog is open and the token
  // stylesheet is in place.
  useLayoutEffect(() => {
    if (!section) return
    setSwatches(readSwatchPalettes())
  }, [section])

  const savedGap = librarySettings.sessionGapMinutes
  const savedThreshold = librarySettings.phashThreshold

  // Keep the editor in step when the catalog value changes (load or save).
  useEffect(() => {
    setGap(String(savedGap))
  }, [savedGap])

  useEffect(() => {
    setThreshold(String(savedThreshold))
  }, [savedThreshold])

  if (!section) return null

  const openLibrary = (mode: 'create' | 'open') => {
    closeSettings()
    openLibraryModal(mode)
  }

  const value = Number(gap)
  const valid = Number.isInteger(value) && value >= 15 && value <= 1440
  const dirty = valid && value !== savedGap

  const thresholdValue = Number(threshold)
  const thresholdValid =
    Number.isInteger(thresholdValue) && thresholdValue >= 0 && thresholdValue <= 64
  const thresholdDirty = thresholdValid && thresholdValue !== savedThreshold

  const saveGap = async () => {
    if (!valid || !dirty || busy) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await updateSettings({ sessionGapMinutes: value })
      setStatus('saved')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const recluster = async () => {
    if (!valid || dirty || busy) return
    const ok = window.confirm(
      'Recluster every session using the saved gap? Session membership will be recomputed from item timestamps, and manual session assignments may be lost.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await reclusterSessions()
      setStatus('sessions reclustered')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveThreshold = async () => {
    if (!thresholdValid || !thresholdDirty || busy) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await updateSettings({ phashThreshold: thresholdValue })
      setStatus('episode threshold saved')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const setAutoCluster = async (enabled: boolean) => {
    if (busy) return
    if (enabled && librarySettings.autoClusterEpisodes) return
    if (!enabled) {
      const ok = window.confirm(
        'Turn off automatic episodes?\n\nExisting automatic episodes will be removed. Episodes you created, renamed, or edited by hand are kept.',
      )
      if (!ok) return
    }
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await updateSettings({ autoClusterEpisodes: enabled })
      if (enabled) {
        setStatus('automatic episodes on')
        return
      }
      const removed = await deleteAutoEpisodes()
      setStatus(
        removed === 0
          ? 'automatic episodes off'
          : `automatic episodes off — ${removed} ${removed === 1 ? 'episode' : 'episodes'} removed`,
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const regenerateAll = async () => {
    if (busy) return
    const ok = window.confirm(
      'Regenerate automatic episodes for every session?\n\nEpisodes you created, renamed, or edited by hand are left alone.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const created = await regenerateAllEpisodes()
      setStatus(
        created === 0
          ? 'no automatic episodes found'
          : `${created} automatic ${created === 1 ? 'episode' : 'episodes'} rebuilt`,
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const exportVocabulary = async () => {
    if (tagBusy) return
    setTagBusy(true)
    setTagError(null)
    setTagStatus(null)
    try {
      await exportTags()
      setTagStatus(`exported ${tags.length} tags`)
    } catch (err) {
      setTagError(errorMessage(err))
    } finally {
      setTagBusy(false)
    }
  }

  const importVocabulary = async (file: File) => {
    if (tagBusy) return
    setTagBusy(true)
    setTagError(null)
    setTagStatus(null)
    try {
      const names = parseTagFile(await file.text())
      if (names.length === 0) {
        setTagError('no tag names found in the file')
        return
      }
      const summary = await importTags(names)
      setTagStatus(
        `imported ${summary.created} new · ${summary.existing} already existed · ${summary.ignored} skipped`,
      )
    } catch (err) {
      setTagError(errorMessage(err))
    } finally {
      setTagBusy(false)
      if (tagFileRef.current) tagFileRef.current.value = ''
    }
  }

  const setBlurNsfw = async (value: boolean) => {
    setBlurError(null)
    try {
      await updateSettings({ blurNsfw: value })
    } catch (err) {
      setBlurError(errorMessage(err))
    }
  }

  const setNsfwTag = async (name: string) => {
    setBlurError(null)
    try {
      await updateSettings({ nsfwTag: name })
      // Group covers carry their NSFW flag from the catalog, so re-fetch them.
      await refreshCatalog()
    } catch (err) {
      setBlurError(errorMessage(err))
    }
  }

  const schemaVersion =
    library && library.schemaVersion > 0 ? `v${library.schemaVersion}` : '—'

  const nsfwTagOptions = Array.from(
    new Set([
      ...tags.map((t) => t.name),
      ...(librarySettings.nsfwTag ? [librarySettings.nsfwTag] : []),
    ]),
  )

  const swatchStyle = (id: Theme): CSSProperties | undefined => {
    const palette = swatches[id]
    if (!palette || !palette.bg || !palette.surface || !palette.gilt) return undefined
    return {
      '--settings-swatch-bg': palette.bg,
      '--settings-swatch-surface': palette.surface,
      '--settings-swatch-gilt': palette.gilt,
    } as CSSProperties
  }

  return (
    <div className="settings-modal" role="presentation">
      <div className="settings-scrim" onClick={closeSettings} />

      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-head">
          <h2 className="settings-title" id="settings-title">
            settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="settings-x"
            aria-label="Close settings"
            onClick={closeSettings}
          >
            ×
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="settings-nav-item"
                aria-current={active === item.id ? 'true' : undefined}
                onClick={() => setActive(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {active === 'appearance' && (
              <div className="settings-section">
                <div className="settings-section-head">
                  <span className="settings-eyebrow">appearance</span>
                  <h3>theme &amp; canvas</h3>
                  <p className="settings-hint">
                    palette, material and grid defaults. changes apply immediately.
                  </p>
                </div>

                <div className="settings-row">
                  <span className="settings-label">theme</span>
                  <div className="settings-theme-grid">
                    {THEMES.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="settings-theme-card"
                        aria-pressed={theme === id}
                        onClick={() => setTheme(id)}
                      >
                        <span
                          className="settings-theme-swatch"
                          data-theme={id}
                          style={swatchStyle(id)}
                          aria-hidden="true"
                        >
                          <span className="settings-theme-swatch-bar" />
                          <span className="settings-theme-swatch-chip" />
                        </span>
                        <span className="settings-theme-name">{THEME_LABELS[id]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <span className="settings-label">effects</span>
                  <div className="settings-segmented" role="group" aria-label="Effects">
                    <button
                      type="button"
                      className="settings-segment"
                      aria-pressed={effects === 'full'}
                      onClick={() => setEffects('full')}
                    >
                      Full effects
                    </button>
                    <button
                      type="button"
                      className="settings-segment"
                      aria-pressed={effects === 'reduced'}
                      onClick={() => setEffects('reduced')}
                    >
                      Reduced effects
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <span className="settings-label">group tiles</span>
                  <div className="settings-segmented" role="group" aria-label="Group tile click action">
                    <button
                      type="button"
                      className="settings-segment"
                      aria-pressed={groupClickMode === 'preview'}
                      onClick={() => setGroupClickMode('preview')}
                    >
                      Click previews
                    </button>
                    <button
                      type="button"
                      className="settings-segment"
                      aria-pressed={groupClickMode === 'expand'}
                      onClick={() => setGroupClickMode('expand')}
                    >
                      Click expands
                    </button>
                  </div>
                  <p className="settings-hint">
                    session and collection tiles. double-click opens or closes the group.
                  </p>
                </div>

                <div className="settings-row">
                  <span className="settings-label">thumbnail fit</span>
                  <div className="settings-segmented" role="group" aria-label="Thumbnail fit">
                    <button
                      type="button"
                      className="settings-segment"
                      aria-pressed={thumbnailFit === 'contain'}
                      onClick={() => setThumbnailFit('contain')}
                    >
                      Whole image
                    </button>
                    <button
                      type="button"
                      className="settings-segment"
                      aria-pressed={thumbnailFit === 'cover'}
                      onClick={() => setThumbnailFit('cover')}
                    >
                      Fill square
                    </button>
                  </div>
                  <p className="settings-hint">
                    whole image adds black bars instead of cropping the thumbnail.
                  </p>
                </div>

                <div className="settings-row">
                  <label className="settings-label" htmlFor="settings-zoom">
                    grid zoom
                  </label>
                  <div className="settings-range-row">
                    <input
                      id="settings-zoom"
                      type="range"
                      min={80}
                      max={320}
                      step={8}
                      value={cellSize}
                      onChange={(event) => setCellSize(Number(event.target.value))}
                    />
                    <output className="settings-readout" htmlFor="settings-zoom">
                      {cellSize} px
                    </output>
                  </div>
                  <p className="settings-hint">default for the gallery zoom.</p>
                </div>

                <p className="settings-note">preferences are saved on this device.</p>
              </div>
            )}

            {active === 'library' && (
              <div className="settings-section">
                <div className="settings-section-head">
                  <span className="settings-eyebrow">library</span>
                  <h3>catalog</h3>
                </div>

                {library?.rootSet ? (
                  <>
                    <div className="settings-library-card">
                      <span className="settings-library-name">{textOrDash(library.name)}</span>
                      <span className="settings-library-root" title={library.root || undefined}>
                        {library.root || '—'}
                      </span>
                      <div className="settings-library-meta">
                        <span>
                          bundle <strong>{textOrDash(library.id)}</strong>
                        </span>
                        <span>
                          schema <strong>{schemaVersion}</strong>
                        </span>
                        <span>
                          app <strong>{textOrDash(library.appVersion)}</strong>
                        </span>
                      </div>
                      <div className="settings-stat-grid">
                        <div className="settings-stat">
                          <span className="settings-stat-value">{library.itemCount}</span>
                          <span className="settings-stat-label">items</span>
                        </div>
                        <div className="settings-stat">
                          <span className="settings-stat-value">{library.sessionCount}</span>
                          <span className="settings-stat-label">sessions</span>
                        </div>
                        <div className="settings-stat">
                          <span className="settings-stat-value">{library.collectionCount}</span>
                          <span className="settings-stat-label">collections</span>
                        </div>
                        <div className="settings-stat">
                          <span className="settings-stat-value">{library.tagCount}</span>
                          <span className="settings-stat-label">tags</span>
                        </div>
                        <div className="settings-stat">
                          <span className="settings-stat-value">{library.sourceCount}</span>
                          <span className="settings-stat-label">sources</span>
                        </div>
                      </div>
                    </div>

                    <div className="settings-actions">
                      <button
                        type="button"
                        className="settings-btn settings-primary"
                        onClick={() => openLibrary('create')}
                      >
                        Create library…
                      </button>
                      <button
                        type="button"
                        className="settings-btn"
                        onClick={() => openLibrary('open')}
                      >
                        Open library…
                      </button>
                    </div>
                  </>
                ) : (
                  <NoLibrary
                    onCreate={() => openLibrary('create')}
                    onOpen={() => openLibrary('open')}
                  />
                )}
              </div>
            )}

            {active === 'sources' && (
              <div className="settings-section">
                {library?.rootSet ? (
                  <SourceManager />
                ) : (
                  <NoLibrary
                    onCreate={() => openLibrary('create')}
                    onOpen={() => openLibrary('open')}
                  />
                )}
              </div>
            )}

            {active === 'tags' && (
              <div className="settings-section">
                {library?.rootSet ? (
                  <>
                    <div className="settings-section-head">
                      <span className="settings-eyebrow">tags</span>
                      <h3>vocabulary</h3>
                      <p className="settings-hint">
                        move the tag list between libraries or share it. only names travel; item
                        assignments stay in this catalog.
                      </p>
                    </div>

                    <div className="settings-row">
                      <span className="settings-label">export</span>
                      <p className="settings-hint">
                        {tags.length} tags. the file is versioned JSON with names, families and
                        informational item counts.
                      </p>
                      <div className="settings-actions">
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={() => void exportVocabulary()}
                          disabled={tagBusy || tags.length === 0}
                        >
                          Export vocabulary…
                        </button>
                      </div>
                    </div>

                    <div className="settings-row">
                      <span className="settings-label">import</span>
                      <p className="settings-hint">
                        merge from JSON or a one-per-line text list (# starts a comment). existing
                        tags are kept; nothing is renamed or deleted.
                      </p>
                      <div className="settings-actions">
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={() => tagFileRef.current?.click()}
                          disabled={tagBusy}
                        >
                          Import vocabulary…
                        </button>
                        <input
                          ref={tagFileRef}
                          type="file"
                          accept=".json,.txt,application/json,text/plain"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void importVocabulary(file)
                          }}
                        />
                      </div>
                    </div>

                    {tagError && (
                      <p className="settings-error" role="alert">
                        {tagError}
                      </p>
                    )}
                    {tagStatus && (
                      <p className="settings-status" role="status" aria-live="polite">
                        {tagStatus}
                      </p>
                    )}

                    <p className="settings-note">
                      Families are derived from the name: <code>artist:foo</code> groups under
                      artist.
                    </p>

                    <div className="settings-section-head">
                      <span className="settings-eyebrow">content</span>
                      <h3>blur NSFW</h3>
                      <p className="settings-hint">
                        blur items tagged with the selected tag everywhere in the gallery.
                      </p>
                    </div>

                    <div className="settings-row">
                      <span className="settings-label">blur NSFW</span>
                      <div className="settings-segmented" role="group" aria-label="Blur NSFW">
                        <button
                          type="button"
                          className="settings-segment"
                          aria-pressed={librarySettings.blurNsfw}
                          onClick={() => void setBlurNsfw(true)}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          className="settings-segment"
                          aria-pressed={!librarySettings.blurNsfw}
                          onClick={() => void setBlurNsfw(false)}
                        >
                          Off
                        </button>
                      </div>
                      <p className="settings-hint">
                        {librarySettings.blurNsfw ? 'enabled — NSFW items are blurred.' : 'off — NSFW items show normally.'}
                      </p>
                    </div>

                    <div className="settings-row">
                      <label className="settings-label" htmlFor="settings-nsfw-tag">
                        nsfw tag
                      </label>
                      <select
                        id="settings-nsfw-tag"
                        className="settings-select"
                        value={librarySettings.nsfwTag}
                        onChange={(event) => void setNsfwTag(event.target.value)}
                      >
                        <option value="">— none —</option>
                        {nsfwTagOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <p className="settings-hint">
                        pick the tag that marks an item as NSFW (for example{' '}
                        <code>rating:explicit</code>).
                      </p>
                    </div>

                    {blurError && (
                      <p className="settings-error" role="alert">
                        {blurError}
                      </p>
                    )}
                  </>
                ) : (
                  <NoLibrary
                    onCreate={() => openLibrary('create')}
                    onOpen={() => openLibrary('open')}
                  />
                )}
              </div>
            )}

            {active === 'behavior' && (
              <div className="settings-section">
                {library?.rootSet ? (
                  <>
                    <div className="settings-section-head">
                      <span className="settings-eyebrow">behavior</span>
                      <h3>session clustering</h3>
                      <p className="settings-hint">
                        sessions group items that were generated close together in time.
                      </p>
                    </div>

                    <div className="settings-row">
                      <label className="settings-label" htmlFor="settings-gap">
                        session inactivity gap
                      </label>
                      <div className="settings-inline">
                        <input
                          id="settings-gap"
                          className="settings-gap-input"
                          type="number"
                          min={15}
                          max={1440}
                          step={15}
                          value={gap}
                          onChange={(event) => setGap(event.target.value)}
                          disabled={busy}
                        />
                        <span className="settings-unit">minutes</span>
                      </div>
                      <p className="settings-hint">
                        saved: {humanizeGap(savedGap)} ({savedGap} min)
                      </p>
                      <p className="settings-hint">range 15–1440 minutes</p>
                    </div>

                    <div className="settings-actions">
                      <button
                        type="button"
                        className="settings-btn settings-primary"
                        onClick={() => void saveGap()}
                        disabled={!valid || !dirty || busy}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="settings-btn"
                        onClick={() => void recluster()}
                        disabled={!valid || dirty || busy}
                      >
                        Apply &amp; recluster
                      </button>
                    </div>

                    {error && (
                      <p className="settings-error" role="alert">
                        {error}
                      </p>
                    )}
                    {status && (
                      <p className="settings-status" role="status" aria-live="polite">
                        {status}
                      </p>
                    )}

                    <p className="settings-note">
                      Reclustering applies the saved gap to the whole catalog.
                    </p>

                    <div className="settings-section-head">
                      <span className="settings-eyebrow">episodes</span>
                      <h3>near-duplicate grouping</h3>
                      <p className="settings-hint">
                        episodes are nested groups of very similar images inside a session or
                        collection.
                      </p>
                    </div>

                    <div className="settings-row">
                      <label className="settings-label" htmlFor="settings-phash">
                        similarity threshold
                      </label>
                      <div className="settings-inline">
                        <input
                          id="settings-phash"
                          className="settings-gap-input"
                          type="number"
                          min={0}
                          max={64}
                          step={1}
                          value={threshold}
                          onChange={(event) => setThreshold(event.target.value)}
                          disabled={busy}
                        />
                        <span className="settings-unit">bits</span>
                      </div>
                      <p className="settings-hint">
                        saved: {savedThreshold} · range 0–64 · lower is stricter
                      </p>
                    </div>

                    <div className="settings-actions">
                      <button
                        type="button"
                        className="settings-btn settings-primary"
                        onClick={() => void saveThreshold()}
                        disabled={!thresholdValid || !thresholdDirty || busy}
                      >
                        Save
                      </button>
                    </div>

                    <div className="settings-row">
                      <span className="settings-label">automatic episodes</span>
                      <div
                        className="settings-segmented"
                        role="group"
                        aria-label="Automatic episodes"
                      >
                        <button
                          type="button"
                          className="settings-segment"
                          aria-pressed={librarySettings.autoClusterEpisodes}
                          onClick={() => void setAutoCluster(true)}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          className="settings-segment"
                          aria-pressed={!librarySettings.autoClusterEpisodes}
                          onClick={() => void setAutoCluster(false)}
                        >
                          Off
                        </button>
                      </div>
                      <p className="settings-hint">
                        {librarySettings.autoClusterEpisodes
                          ? 'episodes are rebuilt after every import; manual edits are kept.'
                          : 'off — group episodes from a group menu or the item Episode menu.'}
                      </p>
                    </div>

                    <div className="settings-row">
                      <span className="settings-label">regenerate episodes</span>
                      <p className="settings-hint">
                        rebuild automatic episodes for every session using the saved
                        threshold. episodes you created or edited by hand are kept.
                      </p>
                      <div className="settings-actions">
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={() => void regenerateAll()}
                          disabled={busy}
                        >
                          Regenerate all
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <NoLibrary
                    onCreate={() => openLibrary('create')}
                    onOpen={() => openLibrary('open')}
                  />
                )}
              </div>
            )}

            {active === 'shortcuts' && (
              <div className="settings-section">
                <div className="settings-section-head">
                  <span className="settings-eyebrow">shortcuts</span>
                  <h3>keyboard</h3>
                  <p className="settings-hint">
                    grid navigation and workspace controls. arrow keys move focus through the grid.
                  </p>
                </div>
                <dl className="settings-shortcuts">
                  {SHORTCUTS.map((shortcut) => (
                    <div className="settings-shortcut" key={shortcut.keys}>
                      <dt className="settings-shortcut-keys">{shortcut.keys}</dt>
                      <dd className="settings-shortcut-action">{shortcut.action}</dd>
                    </div>
                  ))}
                </dl>
                <p className="settings-note">press ? anywhere to jump back here.</p>
              </div>
            )}

            {active === 'about' && (
              <div className="settings-section">
                <div className="settings-section-head">
                  <span className="settings-eyebrow">about</span>
                  <h3>gildex</h3>
                </div>

                <dl className="settings-about-list">
                  <div className="settings-about-row">
                    <dt>app version</dt>
                    <dd>{textOrDash(library?.appVersion)}</dd>
                  </div>
                  <div className="settings-about-row">
                    <dt>library schema</dt>
                    <dd>{schemaVersion}</dd>
                  </div>
                  <div className="settings-about-row">
                    <dt>library id</dt>
                    <dd>{textOrDash(library?.id)}</dd>
                  </div>
                </dl>

                <p className="settings-note">
                  gildex runs locally. No network calls, no telemetry.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
