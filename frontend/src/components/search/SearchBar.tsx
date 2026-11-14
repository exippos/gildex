// Borderless search spanning the grid column, with active tag-filter chips.
// `/` focuses the input from anywhere outside a text field.
import { useEffect, useRef } from 'react'
import { useStore, tagFilterLabel } from '../../store'
import './search-bar.css'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

export function SearchBar() {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const activeTagFilters = useStore((s) => s.activeTagFilters)
  const toggleTagFilter = useStore((s) => s.toggleTagFilter)
  const clearTagFilters = useStore((s) => s.clearTagFilters)

  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`search-bar${activeTagFilters.length ? ' has-chips' : ''}`}>
      <div className="search-line">
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search the catalog  [/]"
          aria-label="Search the catalog"
          spellCheck={false}
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => setSearch('')}
          >
            ×
          </button>
        )}
      </div>

      {activeTagFilters.length > 0 && (
        <div className="search-chips" aria-label="Active tag filters">
          {activeTagFilters.map((name) => (
            <button
              key={name}
              type="button"
              className="search-chip"
              onClick={() => toggleTagFilter(name)}
              aria-label={`Remove tag filter ${tagFilterLabel(name)}`}
            >
              <span className="search-chip-name">{tagFilterLabel(name)}</span>
              <span className="search-chip-x" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
          {activeTagFilters.length > 1 && (
            <button type="button" className="search-chips-clear" onClick={clearTagFilters}>
              clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
