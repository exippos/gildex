// Keyboard shortcuts — the single source of truth for the settings help
// section. Keep the bindings here in step with the real handlers (grid nav in
// Grid.tsx, panel/search toggles in Layout.tsx and SearchBar.tsx).

export interface Shortcut {
  /** The key(s) that trigger the action, as shown to the user. */
  keys: string
  /** What the keys do, in plain language. */
  action: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: '← → ↑ ↓', action: 'Move focus through the grid' },
  { keys: 'Shift + arrows', action: 'Extend the selection' },
  { keys: 'Space', action: 'Select or deselect the focused item' },
  { keys: 'Enter', action: 'Expand or collapse a group · open an item' },
  { keys: 'Ctrl / ⌘ + A', action: 'Select all visible items' },
  { keys: 'Del', action: 'Remove the selected items from the catalog' },
  { keys: 'Home / End', action: 'Jump to the first or last item' },
  { keys: '1 – 5', action: 'Switch surface — All, Sessions, Collections, Folders, Tags' },
  { keys: '/', action: 'Search the catalog' },
  { keys: 'P', action: 'Toggle the preview panel' },
  { keys: '[', action: 'Toggle the navigation rail' },
  { keys: '?', action: 'Show these shortcuts' },
  { keys: 'Esc', action: 'Clear the selection · close dialogs' },
]
