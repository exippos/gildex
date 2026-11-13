// Drag payload shared by grid cells (sources) and collection targets.
// A custom MIME type keeps drops precise in the browser; text/plain is a
// fallback for environments that strip unknown types.
export const ITEM_DRAG_TYPE = 'application/x-gildex-items'

export function setDraggedItems(dataTransfer: DataTransfer, ids: string[]): void {
  dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify(ids))
  dataTransfer.setData('text/plain', ids.join('\n'))
  dataTransfer.effectAllowed = 'copy'
}

export function readDraggedItemIds(dataTransfer: DataTransfer): string[] {
  const raw = dataTransfer.getData(ITEM_DRAG_TYPE)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string' && value !== '')
  } catch {
    return []
  }
}
