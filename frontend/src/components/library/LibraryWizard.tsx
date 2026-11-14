// Library wizard — create a new `.gildex` bundle or open an existing one.
// Reads store.libraryModal, so the parent can mount it unconditionally; it
// renders nothing while the modal is closed. Folder selection is delegated to
// the in-app PathPicker, which stacks above this panel (higher z-index).
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../../store'
import { PathPicker } from '../fs/PathPicker'
import './library-wizard.css'

type PickerTarget = 'folder' | 'library'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Mirrors the backend's trailing-separator trim; the `.gildex` suffix is added
// by the server, so this is only a preview.
function bundlePreview(name: string, directory: string): string {
  const trimmedName = name.trim().replace(/\//g, ' ')
  if (!trimmedName || !directory) return ''
  const parent = directory.length > 1 ? directory.replace(/\/+$/, '') : directory
  return `${parent}/${trimmedName}.gildex`
}

export function LibraryWizard() {
  const mode = useStore((s) => s.libraryModal)
  const library = useStore((s) => s.library)
  const createLibrary = useStore((s) => s.createLibrary)
  const openLibrary = useStore((s) => s.openLibrary)
  const closeLibraryModal = useStore((s) => s.closeLibraryModal)

  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [path, setPath] = useState('')
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fresh form each time the wizard opens or switches mode.
  useEffect(() => {
    setName('')
    setDirectory('')
    setPath('')
    setPicker(null)
    setBusy(false)
    setError(null)
  }, [mode])

  useEffect(() => {
    if (!mode) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Let Escape dismiss only the picker while it is open.
      if (picker) {
        setPicker(null)
        return
      }
      if (busy) return
      closeLibraryModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, picker, busy, closeLibraryModal])

  if (!mode) return null

  const isCreate = mode === 'create'
  const trimmedName = name.trim()
  const preview = isCreate ? bundlePreview(trimmedName, directory) : ''
  const canSubmit = isCreate ? Boolean(trimmedName) && Boolean(directory) : Boolean(path)

  const close = () => {
    if (!busy) closeLibraryModal()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (isCreate) {
        await createLibrary(trimmedName, directory)
      } else {
        await openLibrary(path)
      }
      closeLibraryModal()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const headingId = 'library-wizard-title'
  const pickerTitle = picker === 'library' ? 'Choose a library folder' : 'Choose a parent folder'

  return (
    <div className="library-wizard" role="presentation">
      <div className="library-wizard-scrim" onClick={close} />

      <div
        className="library-wizard-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="library-wizard-head">
          <h2 className="library-wizard-title display" id={headingId}>
            {isCreate ? 'create library' : 'open library'}
          </h2>
          <button
            type="button"
            className="library-wizard-x"
            aria-label="Close"
            onClick={close}
            disabled={busy}
          >
            ×
          </button>
        </header>

        <form className="library-wizard-form" onSubmit={(event) => void submit(event)}>
          <div className="library-wizard-body">
            {library && library.rootSet && (
              <section className="library-wizard-current" aria-label="Currently open library">
                <span className="library-wizard-eyebrow">current library</span>
                <span className="library-wizard-current-name">{library.name}</span>
                <span className="library-wizard-current-root" title={library.root}>
                  {library.root}
                </span>
              </section>
            )}

            {isCreate ? (
              <>
                <label className="library-wizard-field">
                  <span className="library-wizard-label">name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="my library"
                    aria-label="Library name"
                    spellCheck={false}
                    autoFocus
                    disabled={busy}
                  />
                </label>

                <div className="library-wizard-field">
                  <span className="library-wizard-label">parent folder</span>
                  <div className="library-wizard-pick">
                    <span
                      className={`library-wizard-path${directory ? '' : ' is-empty'}`}
                      title={directory || undefined}
                    >
                      {directory || 'no folder chosen'}
                    </span>
                    <button
                      type="button"
                      className="library-wizard-btn"
                      onClick={() => setPicker('folder')}
                      disabled={busy}
                    >
                      Choose folder…
                    </button>
                  </div>
                </div>

                <p className="library-wizard-hint">
                  {preview ? (
                    <>
                      creates <span className="library-wizard-preview">{preview}</span>
                    </>
                  ) : (
                    'the name becomes a .gildex bundle inside the chosen folder.'
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="library-wizard-field">
                  <span className="library-wizard-label">library folder</span>
                  <div className="library-wizard-pick">
                    <span
                      className={`library-wizard-path${path ? '' : ' is-empty'}`}
                      title={path || undefined}
                    >
                      {path || 'no library chosen'}
                    </span>
                    <button
                      type="button"
                      className="library-wizard-btn"
                      onClick={() => setPicker('library')}
                      disabled={busy}
                    >
                      Choose library…
                    </button>
                  </div>
                </div>

                <p className="library-wizard-hint">
                  pick an existing .gildex folder to continue where you left off.
                </p>
              </>
            )}

            {error && (
              <p className="library-wizard-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <footer className="library-wizard-actions">
            <span className="library-wizard-working" role="status" aria-live="polite">
              {busy ? 'working…' : ''}
            </span>
            <div className="library-wizard-buttons">
              <button
                type="button"
                className="library-wizard-btn"
                onClick={close}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="library-wizard-primary"
                disabled={busy || !canSubmit}
              >
                {isCreate ? 'Create library' : 'Open library'}
              </button>
            </div>
          </footer>
        </form>
      </div>

      {picker && (
        <PathPicker
          title={pickerTitle}
          onSelect={(selected) => {
            if (picker === 'folder') setDirectory(selected)
            else setPath(selected)
            setPicker(null)
          }}
          onCancel={() => setPicker(null)}
        />
      )}
    </div>
  )
}

export default LibraryWizard
