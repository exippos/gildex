// Tag families are a naming convention, not a schema: the text before the
// first ':' groups tags in the rail and pickers (e.g. "artist:foo").
import type { Tag } from '../types'

// Suggested families get a stable order; everything else is alphabetical.
const FAMILY_ORDER = ['artist', 'character', 'series', 'style', 'meta', 'rating']

export interface TagGroup {
  family: string
  tags: Tag[]
}

/** Ungrouped tags first, then preferred families, then the rest. */
export function groupTags(tags: Tag[]): TagGroup[] {
  const groups = new Map<string, Tag[]>()
  for (const tag of tags) {
    const family = tag.family || ''
    const bucket = groups.get(family)
    if (bucket) bucket.push(tag)
    else groups.set(family, [tag])
  }

  const order = new Map(FAMILY_ORDER.map((family, index) => [family, index]))
  return [...groups.entries()]
    .map(([family, list]) => ({
      family,
      tags: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (!a.family || !b.family) return a.family ? 1 : b.family ? -1 : 0
      const ai = order.get(a.family)
      const bi = order.get(b.family)
      if (ai !== undefined || bi !== undefined) {
        if (ai === undefined) return 1
        if (bi === undefined) return -1
        return ai - bi
      }
      return a.family.localeCompare(b.family)
    })
}

export function familyLabel(family: string): string {
  return family ? `${family}:` : 'general'
}
