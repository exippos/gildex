// Tag families are a naming convention, not a schema: the text before the
// first ':' groups tags in the rail and pickers (e.g. "artist:foo").
import type { CSSProperties } from 'react'
import type { Tag } from '../types'

// Suggested families get a stable order; everything else is alphabetical.
const FAMILY_ORDER = ['artist', 'character', 'series', 'style', 'meta', 'rating']

// Curated hues for the suggested families; other families hash into the same
// wheel, so a given family always gets the same colour.
const FAMILY_HUES: Record<string, number> = {
  artist: 268,
  character: 338,
  series: 190,
  style: 38,
  meta: 210,
  rating: 148,
}

export interface TagGroup {
  family: string
  tags: Tag[]
}

/** Stable hue (0–359) for a family, or null for ungrouped tags. */
export function familyHue(family: string): number | null {
  if (!family) return null
  const fixed = FAMILY_HUES[family]
  if (fixed !== undefined) return fixed
  let hash = 0
  for (let i = 0; i < family.length; i += 1) {
    hash = (hash * 31 + family.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

/**
 * Inline custom property consumed by the family heading/dot rules. Colour is
 * built in CSS from the theme's saturation/lightness tokens so it adapts to
 * light and dark palettes.
 */
export function familyStyle(family: string): CSSProperties | undefined {
  const hue = familyHue(family)
  if (hue === null) return undefined
  return { '--tag-hue': String(hue) } as CSSProperties
}

/** Family prefix for a bare tag name (used by filter chips, which lack Tag). */
export function familyFromName(name: string): string {
  const colon = name.indexOf(':')
  if (colon <= 0 || colon === name.length - 1) return ''
  const prefix = name.slice(0, colon)
  if (prefix.length > 32) return ''
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix)) return ''
  return prefix.toLowerCase()
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
