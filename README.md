# GILDEX — Prototype

Draft prototype of the GILDEX catalog, built against `../docs_v2/`.

**Scope (P0, per `04-features.md` §1 and Vision §11):** manual import, sessions-first
browsing, quick preview, story view + notes inspector, batch tagging + tag filter,
collections, and a snappy virtualized grid. **Out:** regions, references, attachments,
lineage, watcher, auto-tagging, hover-play frames, audio/video polish.

## Stack

| Layer | Choice |
|---|---|
| Backend | Go (module `gildex`), single binary, local HTTP service |
| DB | SQLite via `modernc.org/sqlite` (pure Go) |
| Stills decode | Go `image` + `x/image` (PNG/JPEG/WebP/GIF) |
| Video/audio | classified, no ffmpeg in the prototype — placeholder thumb |
| Metadata parse | PNG `tEXt` chunks: A1111 `parameters`, ComfyUI `prompt`/`workflow` |
| Near-dup | 64-bit dHash (pure Go), Hamming ≤ 10 groups |
| Frontend | React + TypeScript + Vite, Zustand, custom virtualized grid |

## Run

```
# backend (serves API + built frontend)
cd prototype && go run . -root /path/to/media -listen :8080

# frontend dev (Vite proxies /api to :8080)
cd prototype/frontend && npm install && npm run dev

# frontend build (Go serves frontend/dist when present)
cd prototype/frontend && npm run build
```

First run: click **pick root** in the empty state (or set `-root`), then **import** a
folder of AI-generated PNGs. A1111/ComfyUI prompt + model are parsed automatically;
files without metadata become full items anyway.

### Demo without a real generation stash

```
go run ./tools/seed -out ./seed-out -count 120 -sessions 4
go run . -root ./seed-out            # then import ./seed-out in the UI
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
| POST | `/api/library/root` | body `{ path }`; sets/relocates root (D13) |
| POST | `/api/import` | body `{ paths: string[] }`; starts async job |
| POST | `/api/import/upload` | multipart form `files` (each part's filename = relative path); writes into `<root>/_inbox/`, then starts import → `{ started, count }` |
| GET | `/api/import/status` | → `ImportStatus` (poll while `running`) |
| GET | `/api/items` | query below → `ItemPage` |
| GET | `/api/items/{id}` | → `Item` |
| PATCH | `/api/items/{id}` | body partial: `favorite`, `rating`, `status`, `prompt`, `negativePrompt`, `modelName`, `seed`, `steps`, `sampler`, `cfgScale`, `generatedAt` |
| PATCH | `/api/items/batch` | body `{ ids, addTags[], removeTags[], addToCollectionId, removeFromCollectionId, favorite?, rating?, status?, setSessionId?, removeFromCatalog? }` |
| GET | `/api/sessions` | → `Session[]` |
| PATCH | `/api/sessions/{id}` | body `{ label }` (rename) |
| GET | `/api/tags` | → `Tag[]` |
| POST | `/api/tags` | body `{ name }` → `Tag` |
| DELETE | `/api/tags/{id}` | delete tag (unassigns) |
| GET | `/api/collections` | → `Collection[]` |
| POST | `/api/collections` | body `{ name, description? }` → `Collection` |
| PATCH | `/api/collections/{id}` | body `{ name?, description?, order?: string[] }` (order = full ordered itemIds, D21) |
| DELETE | `/api/collections/{id}` | delete collection (not items) |
| POST | `/api/collections/{id}/items` | body `{ itemIds }` append |
| DELETE | `/api/collections/{id}/items/{itemId}` | remove one |
| GET | `/api/folders` | → `FolderNode[]` (directories only, recursive) |
| GET | `/api/notes?ownerType=&ownerId=` | → `Note[]` |
| POST | `/api/notes` | body `{ ownerType, ownerId, body, typeLabel? }` → `Note` |
| PATCH | `/api/notes/{id}` | body `{ body? }` |
| DELETE | `/api/notes/{id}` | |
| GET | `/api/thumb/{file}` | thumbnail bytes (from `<root>/thumbnails/`) |
| GET | `/api/media/{id}` | original media file bytes (image/video/audio mime) |

### `/api/items` query params

`sessionId`, `collectionId`, `folder` (path prefix, recursive), `tags` (comma list,
AND), `q` (full-text over prompt/negative-prompt/filename/session+collection names),
`kind`, `rating`, `status`, `favorite`, `limit` (default 200), `offset` (default 0),
`sort` (`time` default). Response `{ items, total }`. Each item carries `sessionId`
so the frontend can render the session timeline as sections.

### Import pipeline (D3, D9, D12, D20, D33)

discover → SHA-256 hash → parse metadata (A1111/ComfyUI PNG chunks) → classify
kind/format → dimensions (Go image) → thumbnail JPEG (512px, `<root>/thumbnails/<hash>.jpg`)
→ dHash → timestamp (file birth/mtime) → cluster time-gap sessions (2h default) →
index. Idempotent: re-import never overwrites `manual` user edits (D41).
Remove-from-catalog writes a content-hash tombstone and never deletes disk files (D4).

### Deviations from the full spec (prototype only)

- Search uses `LIKE` (case-insensitive), not FTS5 — FTS5 is the v1 hardening (D23).
- Video/audio items import with a placeholder thumb (no ffmpeg; P2 polish).
- Hover-play frame strips are omitted (P2, D18).
- No regions / references / attachments / lineage / watcher (D8, D28).
