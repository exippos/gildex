// Popover tag picker for the batch toolbar. Lists the vocabulary with
// add/remove semantics plus a create-new input.
import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import './tag-picker.css'

export function TagPicker({ onClose }: { onClose: () => void }) {
  const tags = useStore((s) => s.tags)
  const batchTag = useStore((s) => s.batchTag)
  const createTag = useStore((s) => s.createTag)

  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return tags
    return tags.filter((tag) => tag.name.toLowerCase().includes(needle))
  }, [tags, filter])

  const add = (tagName: string) => {
    onClose()
    void batchTag([tagName], [])
  }

  const remove = (tagName: string) => {
    onClose()
    void batchTag([], [tagName])
  }

  const create = () => {
    const next = name.trim()
    if (!next) return
    setName('')
    void createTag(next)
  }

  return (
    <div className="tag-picker" role="dialog" aria-label="Batch tags">
      <input
        className="tag-picker-filter"
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="filter tags"
        aria-label="Filter tags"
        autoFocus
      />

      <div className="tag-picker-list">
        {visible.map((tag) => (
          <div className="tag-picker-row" key={tag.id}>
            <span className="tag-picker-name" title={tag.name}>
              {tag.name}
            </span>
            <span className="tag-picker-count">{tag.itemCount}</span>
            <button
              type="button"
              className="tag-picker-add"
              title={`Add “${tag.name}”`}
              aria-label={`Add tag ${tag.name}`}
              onClick={() => add(tag.name)}
            >
              +
            </button>
            <button
              type="button"
              className="tag-picker-remove"
              title={`Remove “${tag.name}”`}
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => remove(tag.name)}
            >
              −
            </button>
          </div>
        ))}
        {visible.length === 0 && <div className="tag-picker-empty">no tags match</div>}
      </div>

      <div className="tag-picker-create">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="create new tag"
          aria-label="New tag name"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              create()
            }
          }}
        />
        <button type="button" onClick={create} disabled={!name.trim()}>
          create
        </button>
      </div>
    </div>
  )
}
