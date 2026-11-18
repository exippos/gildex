# gildex

GILDEX is a local-first desktop catalog for media collections, specialized for AI-generated portfolios: it turns a messy heap of generations into a browsable body of work — and remains fully usable for any media library

## Prototype status

Draft prototype of the GILDEX catalog, built against `../docs_v2/`.

**Scope (P0, per `04-features.md` §1 and Vision §11):** manual import, sessions-first
browsing, quick preview, story view + notes inspector, batch tagging + tag filter,
collections, and a snappy virtualized grid. **Out:** regions, references, attachments,
lineage, watcher, auto-tagging, audio polish.

## Stack

| Layer | Choice |
|---|---|
| Backend | Go (module `gildex`), single binary, local HTTP service |
| DB | SQLite via `modernc.org/sqlite` (pure Go) |
| Stills decode | Go `image` + `x/image` (PNG/JPEG/WebP/GIF) |
| Video/audio | video via ffmpeg on PATH (poster thumb + hover-play frame strip, degrades to placeholder); audio placeholder thumb |
| Metadata parse | PNG `tEXt` chunks: A1111 `parameters`, ComfyUI `prompt`/`workflow` |
| Near-dup | 64-bit dHash (pure Go), Hamming ≤ 10 groups |
| Frontend | React + TypeScript + Vite, Zustand, custom virtualized grid |

## Run

```
# backend (serves API + built frontend)
cd prototype && go run . -library /path/to/MyLibrary.gildex -listen :8080

# frontend dev (Vite proxies /api to :8080)
cd prototype/frontend && npm install && npm run dev

# frontend build (Go serves frontend/dist when present)
cd prototype/frontend && npm run build
```

First run: the app shows a **Create/Open library** screen. Create a library
(`<Name>.gildex`, a directory bundle holding the manifest, catalog DB, and
caches), then **add a media source** folder — an external folder referenced in
place, imported `once` or re-scanned on `watch` — and it imports. A1111/ComfyUI
prompt + model are parsed automatically; files without metadata become full
items anyway.

The last library you open or create is remembered (in
`$XDG_CONFIG_HOME/gildex/state.json`, or `~/.config/gildex/state.json`), and the
app reopens it on the next launch unless you pass an explicit `-library` path.
The first-run screen also offers an **Open last library** shortcut to jump back
in.

### Demo without a real generation stash

```
go run ./tools/seed -out ./seed-out -count 120 -sessions 4
go run . -library /tmp/Demo.gildex   # then create/add ./seed-out as a source in the UI
```

`tools/seed` writes synthetic A1111/ComfyUI-style PNGs (prompt, model, params embedded
in `tEXt` chunks) staggered into 4 time-burst "sessions", so the full
import → parse → session-cluster → browse loop is demoable immediately.

## API contract

Base path `/api`. All responses JSON. Item/Session/… shapes are defined in
`internal/model/model.go` and mirror `frontend/src/types.ts`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/status` | → `LibraryStatus` |
| POST | `/api/library` | body `{ name, directory }`; creates ``<directory>/<name>.gildex`` and opens it → `LibraryStatus` |
| POST | `/api/library/open` | body `{ path }`; opens an existing bundle → `LibraryStatus` |
| GET | `/api/sources` | → `Source[]` |
| POST | `/api/sources` | body `{ path, name?, mode? }` (`once`\|`watch`) → `Source` |
| PATCH | `/api/sources/{id}` | body `{ name?, mode? }` → `Source` |
| DELETE | `/api/sources/{id}` | remove source; its items become `missing` |
| POST | `/api/sources/{id}/scan` | start an import scan of that source → `{ started }` |
| GET | `/api/fs/list?path=` | directory browser for the in-app folder picker |
| POST | `/api/import` | body `{ paths: string[] }`; starts async job |
| POST | `/api/import/upload` | multipart form `files` (each part's filename = relative path); writes into `<root>/_inbox/`, then starts import → `{ started, count }` |
| GET | `/api/import/status` | → `ImportStatus` (poll while `running`) |
| GET | `/api/items` | query below → `ItemPage` |
| GET | `/api/items/{id}` | → `Item` |
| PATCH | `/api/items/{id}` | body partial: `favorite`, `rating`, `status`, `prompt`, `negativePrompt`, `modelName`, `seed`, `steps`, `sampler`, `cfgScale`, `generatedAt` |
| PATCH | `/api/items/batch` | body `{ ids, addTags[], removeTags[], addToCollectionId, removeFromCollectionId, favorite?, rating?, status?, setSessionId?, removeFromCatalog? }` |
| GET | `/api/sessions` | → `Session[]` |
| PATCH | `/api/sessions/{id}` | body `{ label?, favorite?, rating?, status?, addTags?, removeTags? }` (group triage/tags, D45) |
| GET | `/api/tags` | → `TagList` (`{ tags: Tag[], untagged }`) |
| POST | `/api/tags` | body `{ name }` → `Tag` |
| GET | `/api/tags/export` | → `gildex.tags` JSON attachment (D44) |
| POST | `/api/tags/import` | body `{ names: string[] }` → `{ created, existing, ignored }` (merge-only) |
| DELETE | `/api/tags/{id}` | delete tag (unassigns) |
| GET | `/api/collections` | → `Collection[]` |
| POST | `/api/collections` | body `{ name, description? }` → `Collection` |
| PATCH | `/api/collections/{id}` | body `{ name?, description?, order?: string[], favorite?, rating?, status?, addTags?, removeTags? }` (order = full ordered itemIds, D21; triage/tags D45) |
| DELETE | `/api/collections/{id}` | delete collection (not items) |
| POST | `/api/collections/{id}/items` | body `{ itemIds }` append |
| DELETE | `/api/collections/{id}/items/{itemId}` | remove one |
| GET | `/api/episodes?ownerType=&ownerId=` | → `Episode[]` nested in one session/collection (D46) |
| POST | `/api/episodes` | body `{ ownerType, ownerId, label, itemIds? }` → `Episode` (manual; moves items out of other episodes of the owner) |
| PATCH | `/api/episodes/{id}` | body `{ label }` rename → `Episode`; flips the episode to manual |
| DELETE | `/api/episodes/{id}` | delete episode, keep items |
| DELETE | `/api/episodes/auto` | remove every automatic episode; manual episodes and items stay |
| POST | `/api/episodes/{id}/items` | body `{ itemIds }` assign → `Episode`; flips to manual |
| DELETE | `/api/episodes/{id}/items/{itemId}` | detach one item → `Episode`; flips to manual |
| POST | `/api/episodes/cluster` | body `{ ownerType?, ownerId? }`; rebuild auto episodes for one group, or every session when omitted → `{ created }` |
| GET | `/api/folders` | → `FolderNode[]` (directories only, recursive) |
| GET | `/api/notes?ownerType=&ownerId=` | → `Note[]` |
| POST | `/api/notes` | body `{ ownerType, ownerId, body, typeLabel? }` → `Note` |
| PATCH | `/api/notes/{id}` | body `{ body? }` |
| DELETE | `/api/notes/{id}` | |
| GET | `/api/thumb/{file}` | thumbnail bytes (from `<root>/thumbnails/`) |
| GET | `/api/media/{id}` | original media file bytes (image/video/audio mime) |

### `/api/items` query params

`sessionId`, `collectionId`, `sourceId` (filter by source), `sourceNull` (items
with no source), `folder` (path prefix, recursive), `tags` (comma list,
AND), `untagged` (only items with no tags), `q` (full-text over
prompt/negative-prompt/filename/session+collection names),
`kind`, `rating`, `status`, `favorite`, `limit` (default 200), `offset` (default 0),
`sort` (`time` default). Response `{ items, total }`. Each item carries `sessionId`
so the frontend can render the session timeline as sections. `LibraryStatus`
carries `id`, `name`, and `sourceCount`.

### Import pipeline (D3, D9, D12, D20, D33)

discover → SHA-256 hash → parse metadata (A1111/ComfyUI PNG chunks) → classify
kind/format → dimensions (Go image) → thumbnail JPEG (512px, `<root>/thumbnails/<hash>.jpg`;
video also gets a poster + 8-frame hover strip via ffmpeg when on PATH)
→ dHash → timestamp (file birth/mtime) → cluster time-gap sessions (2h default) →
index. Idempotent: re-import never overwrites `manual` user edits (D41).
Remove-from-catalog writes a content-hash tombstone and never deletes disk files (D4).

### Deviations from the full spec (prototype only)

- Search uses `LIKE` (case-insensitive), not FTS5 — FTS5 is the v1 hardening (D23).
- Video items import with a poster thumbnail + hover-play frame strip when ffmpeg is on PATH, and a placeholder otherwise; audio still imports with a placeholder thumb (D17/D18/D33).
- No regions / references / attachments / lineage / watcher (D8, D28).
