import type { Status } from '../../types'

// Shared by the batch toolbar and the grid context menu.
export const STATUSES: ReadonlyArray<{ id: Status; label: string }> = [
  { id: 'draft', label: 'draft' },
  { id: 'wip', label: 'wip' },
  { id: 'final', label: 'final' },
]
