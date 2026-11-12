# GILDEX — Vision

Status: Draft v0.5 · Last updated: 2026-11-12

## 1. One-liner

**GILDEX is a local-first desktop catalog for media collections, specialized
for AI-generated portfolios: it turns a messy heap of generations into a
browsable body of work — and remains fully usable for any media library.**

## 2. The name

**GILDEX** is a play on *Gilded Index*: a rich, curated surface laid over a plain
collection of files. The *index* is the general catalog; the *gilding* is the
context — prompt, model, session, curation — layered on top of it.

## 3. The problem

GILDEX is built around two problems that share one shape: a large local pile of
media that deserves better than a file manager.

**The flagship problem — AI generation is iterative.** A single idea produces
many generations: regens, manual fixes, model swaps, small drifts,
near-duplicates. The result is a large heap of similar files that is tedious to
look through. File managers show files, not creative work. Photo galleries
assume one-off photos. Neither understands that generations belong to an
*idea*, a *session*, or a *progression*. But the thing worth keeping is rarely
any single file. It is:

- the different ideas and concepts that were explored,
- how a style changed over time,
- the unfinished threads worth returning to,
- and the context around a result: the prompt, the model, the intent.

That context is the most valuable and the hardest to reconstruct later. GILDEX
captures it at import time and makes the collection presentable.

**The general problem — large personal hoards.** Collected images, saved
artwork, screenshots, photo dumps: the same disorganization without any
generation context. Consumer apps sort by date or album and offer no
cross-cutting, tag-driven organization; cloud tools want the files. The catalog
core of GILDEX serves this case directly.

## 4. The product

GILDEX is a **local desktop catalog** for media collections, focused on images,
short videos, audio, and small files. It is designed as two layers:

- **The catalog core** — items, tags, collections, fast browsing, local-first
  storage. Works for *any* media, with or without metadata.
- **The AI-gen specialization** — the flagship layer: session detection, the
  generation story (result + prompt + model), parameter parsing. Enriches items
  that carry generation context; never required for the core to function.

Those layers describe *what* the catalog stores. Perpendicular to them is a
split in *how* it is shown: the **main view** presents; a separate **inspection
surface** (a dedicated screen or detached window) holds the deep, annotation
layer — notes, regions, references, small-file attachments — so the grid never
carries that weight.

The specialization is the reason GILDEX exists, but the core is what makes it a
general tool: a regular image library is not a second-class citizen, and an AI
stash that contains reference images, textures, or downloaded inspiration does
not break the paradigm.

The intended experience:

1. Point GILDEX at a stash of media — generated, collected, or mixed.
2. It builds the catalog automatically: detects sessions, parses prompts and
   model names where present, generates thumbnails. Files without generation
   metadata become full items anyway.
3. Open the app any time later and browse the library: sessions as the default
   spine, tags, folders, and collections as alternate surfaces.
4. Curate in passing: batch-tag a selection, pull the best into a collection,
   jot a note. The catalog keeps getting better without a filing chore.

## 5. Who it is for

- An individual artist, hobbyist, or researcher with a local stash of
  AI-generated images and videos — the flagship user.
- Anyone with a large local media hoard who wants booru-style, tag-driven
  organization instead of folders-by-date.
- Someone who works locally and cares about privacy, ownership, and keeping
  the collection on their own machine.
- Someone with thousands to hundreds of thousands of files, where manual
  filing has stopped scaling.
- A single user. GILDEX is a personal tool, not a shared service.

## 6. Product direction (settled)

These decisions are fixed direction for the vision and the first prototype.

| Decision | Choice |
|---|---|
| Scope | **General media catalog; AI-generated work is the flagship specialization, not the only citizen** |
| Non-generated media | First-class catalog items; the story layer is optional, never required |
| Name reading | *Gilded Index* |
| Primary browsing surface | **Sessions-first by default**; timeline, folders, collections, and tags are alternate surfaces, and the choice is remembered |
| Session detection (v1) | **Time gaps only** — cluster by inactivity between timestamps |
| Grouping indexes | Sessions (time), tags, collections — first-class indexes; timeline and folders are browse views |
| First-class media | **Images, short videos, and audio**; other small files are attachments, not grid items |
| Library model | **Single library** — one catalog, one configured media root |
| Storage model | **In-place references** — one root, relative paths, content-hash + UUID identity, move detection, missing-file states, copy-into-library for outside-root files |
| Import model | **Manual-first**, plus optional throttled watch on the root for new files |
| Deletion | **Never delete files on disk** — remove-from-catalog writes a trash list (content-hash tombstone) to block rediscovery |
| Network | **Zero network** — URL links are inert text, opened in the system browser |
| Near-duplicates | **pHash at import**; similarity level is a user setting; groups for navigation, never auto-deletes |
| Inspector form | **Hybrid** — in-app screen by default, with an open-in-new-window affordance |
| Deep layer | Notes, local regions, references, small-file attachments — kept **out of the main view**, behind a separate inspection surface |
| Deep-layer owners | Item, session, or collection — one uniform inspector |
| Grid → deep handoff | A light, read-only **quick preview** for triage; the inspector opens one step further for the deep dive |
| Main view trace | **Subtle, toggleable presence badges**; no annotation UI in the grid |
| Prototype inspector | **Story view + notes**; regions, references, and file attachments arrive after the prototype |
| Lineage | **Out of scope for v1**; keep the door open, shape nothing around it |

Anything not listed here is intentionally undecided and tracked in section 12.

## 7. Core capabilities

The pillars of the product, split by layer. Priorities and fine scoping live
in the feature list; this section describes intended behavior deeply enough to
steer the first prototype. **Core** pillars must work with zero generation
metadata; **specialization** pillars enrich items that have it.

### 7.1 Auto "session-sort" — specialization

Work usually moves toward an idea. The generations produced along the way are
similar, iterative, and clustered in time — a *session*. GILDEX detects these
sessions automatically so the catalog reflects how the work was actually made.

Prototype-level behavior:

- Sessions are clusters of items whose timestamps fall inside one active
  period, split where there is a large gap of inactivity. This fits any
  burst-like work: generation sittings, photo shoots, events.
- Clustering runs on import and can be re-run; it is a *suggestion engine* —
  re-running must never destroy user edits (renames, merges, manual moves).
- A session carries a name (auto-generated placeholder until renamed) and a
  time range.
- The user can always create, rename, merge, split, reassign, or dissolve a
  session. Dissolving a session unassigns its items; it never touches media
  files. Manual creation is the general-media path into sessions.
- Time-gap clustering is meaningless for downloaded/collected media (timestamps
  are download times). Those organize by **folders** (a browse view over the
  path tree), tags, and collections instead.
- Detection stays time-based in v1, structured so prompt/metadata similarity
  can refine it later without changing the model.

### 7.2 Tag system — core

Every item can be tagged, and tags form a cross-cutting index alongside
sessions and collections — for concepts that do not fit a single grouping.

Prototype-level behavior:

- Tags are a flat, user-owned vocabulary with their own identity; they are not
  folders and not free-text fragments.
- **Batch tagging is a first-class interaction**: select many items, apply or
  remove tags in one action, with a picker over existing tags plus quick create.
- Tags drive filtering and search over the catalog.
- Auto-tagging is planned as an optional assist, never a dependency; it must
  remain distinguishable from manual tags.

### 7.3 Media item and Gen Media Entity — core entity, specialized presentation

The catalog unit is the **item**: an image, a short video, or an audio clip,
with a stable identity, a thumbnail, a timestamp, tags, and collection
memberships. Every item is a full citizen of the catalog regardless of origin.

When an item carries generation context, it is presented as a **Gen Media
Entity** — the "story" view, the unit that sessions, tags, and collections
organize for AI work:

- the media file itself — one generation, one result,
- the prompt that produced it,
- the model name,
- secondary generation parameters, when available,
- the generation timestamp.

Opening an item from the grid shows a light, read-only **quick preview** (the
result, and the prompt and model when present) for fast triage; the full story
lives in the inspection surface (§7.5). For items without generation context,
the same surfaces degrade gracefully — no empty prompt panels, nothing that
looks broken, just the media and its user layer.

### 7.4 Collection system — core

Collections are user-authored indexes: the curated layer on top of the
automatic one. They express intent that the app cannot infer — selected best
generations united by a scenario, unfinished work, an ideas collection, a
moodboard of collected references.

Prototype-level behavior:

- A collection is a named, ordered list of items; many-to-many with items, flat
  (no nesting) in v1.
- Collections are *views, not copies*: adding an item to a collection never
  moves, duplicates, or modifies the underlying file.

### 7.5 Deep inspection & attachments — core

The main view is for browsing. Everything that would clutter it — notes, local
regions, references, attached small files — lives behind a separate
**inspection surface**: a dedicated screen with an open-in-new-window
affordance (hybrid), opened on any of three owners — an **item**, a **session**,
or a **collection**. This is the workbench layer; the grid is the presentation layer.

Prototype-level behavior:

- The inspector is **owner-polymorphic**: one surface, three owners. Inspecting
  an item shows its full context; inspecting a session shows the story of the
  sitting; inspecting a collection shows its curation statement — plus their
  deep-layer content.
- **Notes** — markdown, several per owner, with a free-form type label (idea /
  artifact / …), and able to reference regions.
- **Regions** — geometric annotations on an image (rectangle / polygon /
  point), normalized coordinates, a label; video regions deferred.
- **References** — lightweight navigation pointers with no progression meaning.
  Two forms: inline `[[item:ID]]` / `[[region:ID]]` / `[[url]]` tokens inside
  notes, and a standalone reference list on the owner. Targets: internal item,
  external file, URL, region. Lineage is a separate, deferred relation
  (parent → child, typed), never built on references.
- **Small files** — attached to any owner, hash-addressed and immutable. This
  is where non-media files (text, documents, project files) enter the catalog;
  they are not grid items.
- The main grid stays pure — no inline annotation UI. Owners with deep-layer
  content show a subtle, toggleable **presence badge** so the layer stays
  discoverable without being opened.

Prototype scope: the inspector ships with the story view, full parsed
parameters, and notes. Regions, references, and file attachments arrive after
the prototype.

### 7.6 Gen-parameter autoparsing — specialization

On import, GILDEX extracts context embedded in files, capturing it at the
moment it is still cheap to get.

Prototype-level behavior:

- Essential fields: **the prompt** and **the model name**. Other parameters are
  welcome but secondary.
- Common embedded generation sources are parsed (e.g. PNG text chunks written
  by A1111, ComfyUI workflows); the raw metadata blob is preserved even when
  unparsed.
- The parsing mechanism is general — pluggable parsers keyed by metadata kind.
  v1 ships generation parsers; the schema accommodates other kinds (EXIF/IPTC
  for photos) as later enrichments without a redesign.
- Files without metadata still become full items; prompt and model can be
  filled by hand.
- Re-importing a file never overwrites user-authored data.

### 7.7 Lineage system — deferred

Lineage would show how generations descend from one another: iterations,
variants, upscales, manual edits. The long-term vision is a branching
progression inferred from generation time and prompts, with manual correction.

**This is out of scope for now.** It should not shape the v1 data model more
than necessary — items should not need a parent to be valid.

## 8. Product principles

1. **Local-first and private by default.** Media and catalog live on the user's
   machine. No account, no cloud dependency.
2. **The human layer is the product.** Prompts, tags, collections, and notes are
   worth more than any individual file. Capture them early; protect them.
3. **The core stands alone.** The catalog must be fully usable with zero
   generation metadata; AI-gen features are enrichments, never prerequisites.
4. **Browse, don't file.** Automate the tedious organization; keep the user in
   control of the meaningful decisions.
5. **Presentation and inspection are separate surfaces.** The main view
   presents; the deep layer (notes, regions, links, attachments) lives behind a
   dedicated inspection surface, so the grid stays fast and clean.
6. **Iteration is first-class.** The catalog should reflect sessions, variants,
   and progression, not present every file as an isolated artifact.
7. **Fast and quiet.** Browsing large libraries must feel snappy, and the app
   must stay light on RAM, disk, and GPU so it does not compete with local
   generation.
8. **Forgiving by design.** User-authored data is irreplaceable; derived data
   (thumbnails, indexes, previews) is rebuildable and never the only copy.
9. **Progressive disclosure.** A simple default surface, with power features
   available when the user wants them.

## 9. What GILDEX is not

- Not an image/video generator or a model runner.
- Not a cloud service, social network, or sharing platform.
- Not a general-purpose digital asset manager for professional photography
  workflows (client proofing, licensing, studio pipelines).
- Not a file manager or duplicate cleaner — near-duplicate *grouping* exists
  for navigation (pHash, §6), but GILDEX never deletes or deduplicates files.
- Not a video editor or a prompt-engineering IDE.
- Not a lineage-graph tool in v1.

## 10. What success looks like

- Opening the app shows a meaningful portfolio, not a wall of undifferentiated
  files.
- "That idea I had a month ago" can be found in seconds through a session, tag,
  or collection.
- A mixed stash — generations plus references plus saved art — catalogs in one
  pass and nothing feels out of place.
- A purely regular library (wallpapers, screenshots, photo dumps) organizes and
  browses well through tags, folders, and collections.
- Opening any item, session, or collection can reveal its notes, annotations,
  links, and attached files without ever cluttering the main grid.
- Importing a folder produces sensible sessions with little or no manual sorting.
- Adding tens of thousands of files does not make browsing sluggish.
- Prompt and model metadata are captured at import time and are never lost.
- The user trusts the catalog enough to stop maintaining a parallel folder
  structure by hand.

## 11. First prototype target

The prototype exists to prove the core loop is valuable and performant, with
the AI-gen specialization as the flagship path. It should demonstrate:

1. **Import** a mixed folder of AI-generated images and short videos plus some
   non-generated files: all become items, prompts and model names parsed where
   present, thumbnails background-generated, sessions detected by time gaps.
2. **Browse sessions-first**: the session timeline is the default home;
   switching to another surface (timeline, collections, tags) works and is
   remembered. Opening a session shows its items.
3. **Quick preview**: opening an item shows a light, read-only preview (result,
   and prompt + model when present). Non-gen items show the same preview,
   degraded gracefully.
4. **Inspect**: the inspector opens on an item, session, or collection and shows
   the story view with full parsed parameters and notes; presence badges appear
   in the grid.
5. **Batch tag** a multi-selection and filter the catalog by tag.
6. **Create a collection** and add items to it.
7. **Stay snappy** over a large import (tens of thousands of items) in the
   browsing grid.

Explicitly out of the prototype: lineage, auto-tagging, regions, references,
file attachments, audio/text polish, multi-library, video regions,
sharing/export, the watcher.

## 12. Open questions

All items settled as of 2026-11-12 (D1–D40). Remaining work lives in the
downstream docs (`02`–`05`) and the glossary, not here.
