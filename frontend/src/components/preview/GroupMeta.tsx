// Group-owned triage and tags for the session/collection preview (D45).
// These edits belong to the group itself; member items are not touched.
import { useStore } from '../../store'
import type { Collection, GroupType, Session } from '../../types'
import { STATUSES } from '../grid/statuses'
import { TagEditor } from './TagEditor'

type GroupRecord = Session | Collection

export function GroupMeta({ type, group }: { type: GroupType; group: GroupRecord }) {
  const tags = useStore((s) => s.tags)
  const saveGroup = useStore((s) => s.saveGroup)
  const updateCollection = useStore((s) => s.updateCollection)
  const noun = type === 'session' ? 'session' : 'collection'

  // Tolerate a stale backend that predates group metadata (D45).
  const favorite = group.favorite ?? false
  const rating = group.rating ?? 0
  const status = group.status ?? 'draft'
  const groupTags = group.tags ?? []
  // The sorted/raw marker is collection-only and user-set, never inferred.
  const sorted = type === 'collection' && 'sorted' in group ? group.sorted : false

  return (
    <>
      <div className="preview-section">
        <div className="preview-section-label display">triage</div>

        <button
          type="button"
          className={`preview-fav${favorite ? ' is-on' : ''}`}
          aria-pressed={favorite}
          title={`Favorite ${noun}`}
          onClick={() => void saveGroup(type, group.id, { favorite: !favorite })}
        >
          <span className="preview-fav-mark" aria-hidden="true" />
          favorite
        </button>

        <div className="preview-rating" role="group" aria-label={`${noun} rating`}>
          <span className="preview-control-label">rating</span>
          <div className="preview-rating-dots">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`preview-rating-dot${value <= rating ? ' is-on' : ''}`}
                aria-label={`${value} of 5`}
                aria-pressed={value === rating}
                onClick={() =>
                  void saveGroup(type, group.id, {
                    rating: value === rating ? 0 : value,
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="preview-status" role="group" aria-label={`${noun} status`}>
          <span className="preview-control-label">status</span>
          <div className="preview-status-row">
            {STATUSES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`preview-status-button${status === entry.id ? ' is-active' : ''}`}
                data-status={entry.id}
                aria-pressed={status === entry.id}
                onClick={() => void saveGroup(type, group.id, { status: entry.id })}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {type === 'collection' && (
          <label className="preview-check" title="Curated — manually sorted">
            <input
              type="checkbox"
              checked={sorted}
              onChange={(e) =>
                void updateCollection(group.id, { sorted: e.target.checked })
              }
            />
            <span className="preview-control-label">sorted</span>
          </label>
        )}
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">tags</div>
        <TagEditor
          tags={tags}
          stateFor={(name) => ({ on: groupTags.includes(name) ? 1 : 0, total: 1 })}
          onAdd={(name) => void saveGroup(type, group.id, { addTags: [name] })}
          onRemove={(name) => void saveGroup(type, group.id, { removeTags: [name] })}
        />
      </div>
    </>
  )
}
