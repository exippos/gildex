# GILDEX

A local-first desktop catalog for media collections, built for AI-generated portfolios.

## What GILDEX is for

GILDEX turns a messy heap of generations into a browsable body of work. Point it
at your media stash and it imports, parses generation metadata, clusters files
into **sessions** by time, and gives you a fast, searchable wall of thumbnails —
sessions first, so the story of a generation session is what you see.

It is **local-first and non-destructive**: no network calls, media referenced in
place (never copied or moved), and nothing is ever deleted from disk — removing
an item only hides it from the catalog. Everything runs in a single Go binary
with a React frontend, and it is just as useful for any ordinary image, video,
or audio library.

## Features

- **Library & ingest** — create or open a `.gildex` library bundle; add media
  source folders (import once, or watch and rescan); drag-and-drop upload;
  content-hash deduplication; missing-file placeholders.
- **Browse** — sessions (time-gap clusters), collections, folders, tags, and a
  timeline; a snappy virtualized grid with group tiles and hover-play for video.
- **Episodes & near-duplicates** — automatically cluster visually similar images
  inside a session or collection (pHash), or curate them by hand; pick a cover
  image per episode.
- **Organize** — tags with `family:name` families, group tags and triage on
  sessions and collections, favorite / rating / status, a batch toolbar, and
  ordered collections with drag-and-drop.
- **Inspect** — a story view showing A1111/ComfyUI prompt, model, and
  parameters; markdown notes; and a quick-preview panel.
- **Search & filter** — full-text search over prompts, filenames, and group
  names; AND-combined tag filters; sort by time, filename, size, session,
  rating, status, or favorite.
- **Settings** — four themes, effects and grid zoom, NSFW blur, session-gap
  tuning with recluster, pHash threshold, and tag import/export.
- **Formats** — stills PNG/JPEG/WebP/GIF/BMP; video MP4/WebM/MOV/MKV; audio
  WAV/MP3/FLAC/OGG/M4A.

## Run from source

Requirements: **Go 1.26+**, **Node.js 18+ and npm** (for the frontend), and
optionally **ffmpeg on PATH** for video hover-play and thumbnails.

```sh
# 1. Backend (serves the API, and the built frontend when present)
go run . -library /path/to/MyLibrary.gildex -listen :8080

# 2. Frontend dev server (Vite proxies /api to :8080)
cd frontend && npm install && npm run dev

# 3. Build the frontend so the Go server serves it directly
cd frontend && npm run build
```

On first run the app shows a **Create/Open library** screen. Create a library
(`<Name>.gildex`, a directory bundle holding the manifest, catalog database, and
caches), then add a media source folder and it imports. The last library you
open or create is remembered and reopened on the next launch.

### Demo without a real generation stash

```sh
go run ./tools/seed -out ./seed-out -count 120 -sessions 4
go run . -library /tmp/Demo.gildex   # then add ./seed-out as a source in the UI
```

`tools/seed` writes synthetic A1111/ComfyUI-style PNGs (prompt, model, and
parameters embedded in `tEXt` chunks) staggered into four time-burst sessions, so
the full import → parse → session-cluster → browse loop is demoable immediately.

## Library file structure

A GILDEX library is a single relocatable directory bundle:

```
MyLibrary.gildex/
├── library.gildex.json   # manifest: name, id, schema version, timestamps
├── catalog.db            # SQLite catalog (+ -wal / -shm while running)
├── thumbnails/           # <hash>.jpg and <hash>-fNN.jpg hover-play frames
├── attachments/          # managed attached files, hash-addressed
└── _inbox/               # drop folder for uploads and the watcher
```

Media itself lives in the external **source** folders you add — GILDEX references
those files in place and stores paths relative to each source, never copying
them into the bundle. App-level state (the last opened library) is kept outside
the bundle at `~/.config/gildex/state.json`.

## How it works

A single Go binary owns everything: it serves the React frontend, runs the
import pipeline, and talks to SQLite (via `modernc.org/sqlite`, pure Go — no
CGo). Importing is a pipeline of discover → hash → parse metadata → thumbnail →
pHash → cluster → index, run asynchronously and idempotently so re-imports never
overwrite your edits. See `docs/03-architecture.md` for the data model and
pipeline, and `docs/00-decisions.md` for the rationale behind each choice.

## Source tree

```
main.go          entry point: flags, library open, HTTP server, watcher
internal/        api (handlers), store (SQLite), importpkg (pipeline),
                 metadata, phash, thumb, video, watch, model (shared types)
frontend/        React + TypeScript + Vite app (src/ with Zustand store)
tools/seed/      synthetic A1111/ComfyUI PNG generator for demos
docs/            planning documents (decisions, architecture, features)
design/          static HTML mockups (reference only, not app code)
```

## Documentation

The full planning set lives in `docs/` — see `docs/README.md` for the index.
The HTTP API is defined in `internal/api/` and mirrored by
`frontend/src/types.ts` and `internal/model/model.go`.

## Status & scope

This is a draft prototype. Known gaps versus the full design:

- Search uses `LIKE` (case-insensitive); FTS5 full-text search is the v1
  hardening (D23).
- Video needs ffmpeg on PATH for a poster thumbnail and hover-play frames;
  audio imports with a placeholder thumbnail.
- Regions, references, attachments, and lineage are not yet implemented
  (D8/D28).

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `←` `→` `↑` `↓` | Move focus through the grid |
| `Shift` + arrows | Extend the selection |
| `Space` | Select or deselect the focused item |
| `Enter` | Expand or collapse a group · open an item |
| `Ctrl` / `⌘` + `A` | Select all visible items |
| `Del` | Remove selected items from the catalog |
| `Home` / `End` | Jump to the first or last item |
| `1` – `5` | Switch surface — All, Sessions, Collections, Folders, Tags |
| `/` | Search the catalog |
| `P` | Toggle the preview panel |
| `[` | Toggle the navigation rail |
| `?` | Show these shortcuts |
| `Esc` | Clear the selection · close dialogs |
