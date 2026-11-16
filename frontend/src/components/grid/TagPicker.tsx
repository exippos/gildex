// Popover tag picker for the batch toolbar. Lists the vocabulary with
// add/remove semantics plus a create-new input. It stays open after each
// action so several tags can be applied in one pass.
import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../../store'
import { familyLabel, familyStyle, groupTags } from '../tags'
import './tag-picker.css'

export function TagPicker() {
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
  const groups = useMemo(() => groupTags(visible), [visible])
  const showFamilies = groups.some((group) => group.family)

  const add = (tagName: string) => {
    void batchTag([tagName], [], { keep: true })
  }

  const remove = (tagName: string) => {
    void batchTag([], [tagName], { keep: true })
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
        {groups.map((group) => (
          <Fragment key={group.family || 'general'}>
            {showFamilies && (
              <div
                className={`tag-picker-family${group.family ? ' is-family' : ''}`}
                style={familyStyle(group.family)}
              >
                {familyLabel(group.family)}
              </div>
            )}
            {group.tags.map((tag) => (
              <div
                className={`tag-picker-row${tag.family ? ' is-family' : ''}`}
                key={tag.id}
                style={familyStyle(tag.family)}
              >
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
          </Fragment>
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
