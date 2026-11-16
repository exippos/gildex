// Media path resolution for display. Items keep the path relative to their
// source (or the library root) plus the absolute path captured at import, so a
// missing item can still say where it came from after its source is removed.
import type { Item, Source } from '../types'

type PathItem = Pick<Item, 'relativePath' | 'originPath' | 'sourceId'>

function joinPath(base: string, rel: string): string {
  const cleanBase = base.replace(/[\\/]+$/, '')
  const cleanRel = rel.replace(/^[\\/]+/, '')
  if (!cleanBase) return cleanRel
  if (!cleanRel) return cleanBase
  return `${cleanBase}/${cleanRel}`
}

/** Absolute on-disk path, preferring the live source/root and falling back to
 *  the import-time snapshot when the source is gone. */
export function resolveMediaPath(
  item: PathItem,
  sources: Source[],
  libraryRoot: string,
): string {
  if (item.sourceId) {
    const source = sources.find((entry) => entry.id === item.sourceId)
    if (source) return joinPath(source.path, item.relativePath)
    return item.originPath || item.relativePath
  }
  if (libraryRoot) return joinPath(libraryRoot, item.relativePath)
  return item.originPath || item.relativePath
}
