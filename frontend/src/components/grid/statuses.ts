import type { Status } from '../../types'

// Shared by the batch toolbar and the grid context menu.
export const STATUSES: ReadonlyArray<{ id: Status; label: string }> = [
  { id: 'idea', label: 'idea' },
  { id: 'draft', label: 'draft' },
  { id: 'wip', label: 'wip' },
  { id: 'final', label: 'final' },
]

// Workflow rank, used when sorting group tiles by their own status.
export const STATUS_ORDER: Record<Status, number> = {
  idea: 0,
  draft: 1,
  wip: 2,
  final: 3,
}
