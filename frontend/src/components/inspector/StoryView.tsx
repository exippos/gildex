// The gallery plaque (D9) — media beside a quiet, engraved story label.
// Editable user fields write through the store; media via mediaUrl only.
import { useId, useState } from 'react'
import { mediaUrl, thumbUrl } from '../../api'
import { useStore } from '../../store'
import type { Item, Status } from '../../types'
import './story-view.css'

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function fmtBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function humanKey(key: string): string {
  return key.replace(/[_-]+/g, ' ')
}

const STATUSES: Status[] = ['draft', 'wip', 'final']

export function StoryView({ item }: { item: Item }) {
  const saveItem = useStore((s) => s.saveItem)
  const toggleFavorite = useStore((s) => s.toggleFavorite)

  const statusId = useId()
  const [editing, setEditing] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNegative, setShowNegative] = useState(false)
  const [showExtra, setShowExtra] = useState(false)

  const missing = item.state === 'missing'
  const fileLabel = basename(item.relativePath) || item.id
  const hasGeneration =
    Boolean(item.prompt) ||
    Boolean(item.negativePrompt) ||
    Boolean(item.modelName) ||
    item.seed !== null ||
    item.steps !== null ||
    Boolean(item.sampler) ||
    item.cfgScale !== null ||
    item.generatedAt !== null

  const extraEntries = Object.entries(item.extra)

  const spec: Array<[string, string]> = []
  if (item.modelName) spec.push(['model', item.modelName])
  if (item.seed !== null) spec.push(['seed', String(item.seed)])
  if (item.steps !== null) spec.push(['steps', String(item.steps)])
  if (item.sampler) spec.push(['sampler', item.sampler])
  if (item.cfgScale !== null) spec.push(['cfg_scale', String(item.cfgScale)])
  if (item.generatedAt !== null) spec.push(['generated', fmtDate(item.generatedAt)])

  const startEdit = () => {
    setPromptDraft(item.prompt ?? '')
    setModelDraft(item.modelName ?? '')
    setError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setError(null)
  }

  const commitEdit = async () => {
    const prompt = promptDraft.trim()
    const model = modelDraft.trim()
    setSaving(true)
    setError(null)
    try {
      await saveItem(item.id, {
        prompt: prompt ? prompt : null,
        modelName: model ? model : null,
      })
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const setRating = async (value: number) => {
    try {
      await saveItem(item.id, { rating: item.rating === value ? 0 : value })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setStatus = async (value: Status) => {
    try {
      await saveItem(item.id, { status: value })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="story" aria-label="story view">
      <div className={`story-media story-media--${missing ? 'missing' : item.kind}`}>
        {missing ? (
          <div className="story-missing" role="img" aria-label="file missing">
            <span className="story-missing-tick" aria-hidden="true" />
            <span className="story-missing-title display">missing file</span>
            <span className="story-missing-sub">kept in the catalog — media unavailable.</span>
          </div>
        ) : item.kind === 'image' ? (
          <img src={mediaUrl(item.id)} alt={fileLabel} />
        ) : item.kind === 'video' ? (
          <video
            src={mediaUrl(item.id)}
            controls
            playsInline
            poster={thumbUrl(item.thumbnailPath) ?? undefined}
          />
        ) : (
          <div className="story-audio">
            <span className="story-audio-title display">{fileLabel}</span>
            <audio src={mediaUrl(item.id)} controls />
          </div>
        )}
      </div>

      <div className="story-plaque">
        {hasGeneration && (
          <>
            <div className="story-block">
              <div className="story-label-row">
                <h2 className="story-label display">prompt</h2>
                {!editing && (
                  <button type="button" className="story-link" onClick={startEdit}>
                    edit
                  </button>
                )}
              </div>
              {editing ? (
                <div className="story-edit">
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    rows={5}
                    aria-label="prompt"
                    autoFocus
                  />
                  <label className="story-edit-label display" htmlFor="story-model">
                    model
                  </label>
                  <input
                    id="story-model"
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    aria-label="model name"
                  />
                  <div className="story-edit-actions">
                    <button
                      type="button"
                      className="story-primary"
                      onClick={() => void commitEdit()}
                      disabled={saving}
                    >
                      {saving ? 'saving…' : 'save'}
                    </button>
                    <button type="button" onClick={cancelEdit} disabled={saving}>
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className={`story-prompt${item.prompt ? '' : ' is-empty'}`}>
                  {item.prompt || 'no prompt recorded.'}
                </p>
              )}
            </div>

            {item.negativePrompt && (
              <div className="story-disclosure">
                <button
                  type="button"
                  className="story-disclosure-btn"
                  aria-expanded={showNegative}
                  onClick={() => setShowNegative((v) => !v)}
                >
                  <span
                    className={`story-caret${showNegative ? ' is-open' : ''}`}
                    aria-hidden="true"
                  />
                  negative prompt
                </button>
                {showNegative && <p className="story-negative">{item.negativePrompt}</p>}
              </div>
            )}

            {spec.length > 0 && (
              <dl className="story-spec">
                {spec.map(([label, value]) => (
                  <div className="story-spec-item" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {extraEntries.length > 0 && (
              <div className="story-disclosure story-extra">
                <button
                  type="button"
                  className="story-disclosure-btn"
                  aria-expanded={showExtra}
                  onClick={() => setShowExtra((v) => !v)}
                >
                  <span
                    className={`story-caret${showExtra ? ' is-open' : ''}`}
                    aria-hidden="true"
                  />
                  additional
                  <span className="story-extra-count">{extraEntries.length}</span>
                </button>
                {showExtra && (
                  <dl className="story-extra-list">
                    {extraEntries.map(([key, value]) => (
                      <div className="story-extra-row" key={key}>
                        <dt>{humanKey(key)}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </>
        )}

        <div className="story-controls">
          <div className="story-control">
            <span className="story-control-label display">favorite</span>
            <button
              type="button"
              className={`story-fav${item.favorite ? ' is-on' : ''}`}
              aria-pressed={item.favorite}
              aria-label={item.favorite ? 'remove favorite' : 'mark favorite'}
              onClick={() => void toggleFavorite(item.id)}
            >
              ★
            </button>
          </div>

          <div className="story-control">
            <span className="story-control-label display">rating</span>
            <div className="story-rating" role="group" aria-label="rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`story-star${n <= item.rating ? ' is-on' : ''}`}
                  aria-label={`rate ${n}`}
                  aria-pressed={n === item.rating}
                  onClick={() => void setRating(n)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="story-control">
            <label className="story-control-label display" htmlFor={statusId}>
              status
            </label>
            <div className={`story-status story-status--${item.status}`}>
              <span className="story-status-tick" aria-hidden="true" />
              <select
                id={statusId}
                value={item.status}
                onChange={(e) => void setStatus(e.target.value as Status)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <dl className="story-files">
          <div className="story-file-row">
            <dt>format</dt>
            <dd>{item.format ? item.format.toUpperCase() : item.kind}</dd>
          </div>
          {item.width > 0 && item.height > 0 && (
            <div className="story-file-row">
              <dt>dimensions</dt>
              <dd>
                {item.width} × {item.height}
              </dd>
            </div>
          )}
          {item.duration !== null && (
            <div className="story-file-row">
              <dt>duration</dt>
              <dd>{item.duration.toFixed(1)}s</dd>
            </div>
          )}
          <div className="story-file-row">
            <dt>size</dt>
            <dd>{fmtBytes(item.fileSize)}</dd>
          </div>
          <div className="story-file-row">
            <dt>modified</dt>
            <dd>{fmtDate(item.timestamp)}</dd>
          </div>
          <div className="story-file-row">
            <dt>state</dt>
            <dd className={missing ? 'is-missing' : undefined}>
              {missing && <span className="story-danger-tick" aria-hidden="true" />}
              {item.state}
            </dd>
          </div>
        </dl>

        <p className="story-source">
          <span className="display">source</span> {item.relativePath}
        </p>

        {error && <p className="story-error">{error}</p>}
      </div>
    </section>
  )
}
