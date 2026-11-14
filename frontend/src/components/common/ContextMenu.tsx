// A fixed-position context menu. One level of submenus (rate / status) and
// plain items with optional check marks, hints and danger styling.
// Keyboard: arrows move, Right opens a submenu, Left/Escape close, Tab dismisses.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import './context-menu.css'

export type MenuEntry =
  | {
      kind: 'item'
      label: string
      hint?: string
      checked?: boolean
      disabled?: boolean
      danger?: boolean
      onSelect: () => void
    }
  | { kind: 'submenu'; label: string; items: MenuEntry[] }
  | { kind: 'separator' }

interface ContextMenuProps {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

interface SubmenuState {
  index: number
  top: number
  flip: boolean
  focus: boolean
}

function directItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return []
  return Array.from(panel.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.hasAttribute('data-ctx-item') && !(el as HTMLButtonElement).disabled,
  )
}

function moveFocus(panel: HTMLElement | null, dir: 1 | -1): void {
  const items = directItems(panel)
  if (!items.length) return
  const at = items.indexOf(document.activeElement as HTMLElement)
  const next = at === -1 ? (dir === 1 ? 0 : items.length - 1) : (at + dir + items.length) % items.length
  items[next]?.focus()
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const subRef = useRef<HTMLDivElement | null>(null)
  const subTriggerRef = useRef<HTMLElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y, ready: false })
  const [sub, setSub] = useState<SubmenuState | null>(null)

  // Clamp the panel to the viewport once its size is known.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad)),
      ready: true,
    })
  }, [x, y])

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = directItems(panelRef.current)[0]
    first?.focus()
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        const previous = previousFocus.current
        onClose()
        if (previous?.isConnected) window.setTimeout(() => previous.focus(), 0)
      }
    }
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      onClose()
    }
    const onBlur = () => onClose()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  const run = (fn: () => void) => {
    onClose()
    fn()
  }

  const openSubmenu = (index: number, trigger: HTMLElement, focus = false) => {
    const panel = panelRef.current
    if (!panel) return
    const entry = items[index]
    const rows = entry?.kind === 'submenu' ? entry.items.length : 0
    subTriggerRef.current = trigger
    const rect = trigger.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const estimated = rows * 28 + 12
    const viewportTop = Math.max(
      8,
      Math.min(rect.top - 5, window.innerHeight - estimated - 8),
    )
    setSub({
      index,
      top: viewportTop - panelRect.top,
      flip: panelRect.right + 190 > window.innerWidth - 8,
      focus,
    })
  }

  const closeSubmenu = () => {
    setSub(null)
    subTriggerRef.current?.focus()
  }

  // Keyboard-opened submenus move focus inside; hover-opened ones do not.
  useEffect(() => {
    if (!sub?.focus) return
    const first = directItems(subRef.current)[0]
    first?.focus()
  }, [sub])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    // Keys inside a submenu are handled there; let them bubble no further.
    if (subRef.current?.contains(target)) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(panelRef.current, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(panelRef.current, -1)
        break
      case 'Home':
        event.preventDefault()
        directItems(panelRef.current)[0]?.focus()
        break
      case 'End': {
        event.preventDefault()
        const all = directItems(panelRef.current)
        all[all.length - 1]?.focus()
        break
      }
      case 'ArrowRight': {
        const index = Number(target.dataset.ctxIndex)
        const entry = items[index]
        if (entry?.kind === 'submenu') {
          event.preventDefault()
          openSubmenu(index, target, true)
        }
        break
      }
      case 'ArrowLeft':
        if (sub) {
          event.preventDefault()
          closeSubmenu()
        }
        break
      case 'Tab':
        event.preventDefault()
        onClose()
        break
      default:
        break
    }
  }

  const onSubKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        moveFocus(subRef.current, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        moveFocus(subRef.current, -1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        event.stopPropagation()
        closeSubmenu()
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        closeSubmenu()
        break
      case 'Tab':
        event.preventDefault()
        event.stopPropagation()
        onClose()
        break
      default:
        event.stopPropagation()
        break
    }
  }

  const subEntry = sub ? items[sub.index] : null

  return (
    <div
      className="ctx-panel"
      ref={panelRef}
      role="menu"
      aria-label="Item actions"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {items.map((entry, index) => {
        if (entry.kind === 'separator') {
          return <div key={`sep-${index}`} className="ctx-sep" role="separator" />
        }
        if (entry.kind === 'submenu') {
          return (
            <button
              key={`sub-${index}`}
              type="button"
              className={`ctx-item${sub?.index === index ? ' is-open' : ''}`}
              data-ctx-item
              data-ctx-index={index}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub?.index === index}
              onPointerEnter={(event) => openSubmenu(index, event.currentTarget)}
              onClick={(event) => {
                if (sub?.index === index) setSub(null)
                else openSubmenu(index, event.currentTarget)
              }}
            >
              <span className="ctx-item-label">{entry.label}</span>
              <span className="ctx-item-arrow" aria-hidden="true" />
            </button>
          )
        }
        return (
          <button
            key={`item-${index}`}
            type="button"
            className={`ctx-item${entry.danger ? ' is-danger' : ''}`}
            data-ctx-item
            data-ctx-index={index}
            role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={entry.checked}
            disabled={entry.disabled}
            onPointerEnter={() => setSub(null)}
            onClick={() => run(entry.onSelect)}
          >
            <span className="ctx-item-label">{entry.label}</span>
            {entry.hint && <span className="ctx-item-hint">{entry.hint}</span>}
            {entry.checked && <span className="ctx-item-check" aria-hidden="true" />}
          </button>
        )
      })}

      {sub && subEntry?.kind === 'submenu' && (
        <div
          className={`ctx-panel ctx-sub${sub.flip ? ' is-flip' : ''}`}
          ref={subRef}
          role="menu"
          aria-label={subEntry.label}
          style={{ top: sub.top }}
          onKeyDown={onSubKeyDown}
        >
          {subEntry.items.map((entry, index) => {
            if (entry.kind === 'separator') {
              return <div key={`sep-${index}`} className="ctx-sep" role="separator" />
            }
            if (entry.kind === 'submenu') return null
            return (
              <button
                key={`sub-item-${index}`}
                type="button"
                className={`ctx-item${entry.danger ? ' is-danger' : ''}`}
                data-ctx-item
                role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={entry.checked}
                disabled={entry.disabled}
                onClick={() => run(entry.onSelect)}
              >
                <span className="ctx-item-label">{entry.label}</span>
                {entry.hint && <span className="ctx-item-hint">{entry.hint}</span>}
                {entry.checked && <span className="ctx-item-check" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
