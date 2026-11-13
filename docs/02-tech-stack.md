# GILDEX — Tech Stack

Status: Draft v0.1 · Last updated: 2026-11-12

The technology choices for GILDEX, cited against the decisions log
(`00-decisions.md`). Each row here traces to a settled decision; anything not yet
settled is called out under "Open items" rather than invented here.

## 1. Stack at a glance

| Layer | Choice | Decision |
|---|---|---|
| Desktop targets | Linux, Windows, macOS | D29 |
| Backend language | Go (≥ 1.26) | D30 |
| Desktop shell | Wails **v3** (native webview) | D30, D35 |
| Frontend | React + TypeScript, built with Vite | D34 |
| Database | SQLite via `modernc.org/sqlite` (pure Go, FTS5) | D32 |
| Media decode | Go `image`/`x/image` (stills) + bundled `ffmpeg` binary (video/audio/animated) | D33 |
| Hashing | SHA-256 content hash; pHash for near-dup | D1, D2 |
| Network | None | D5 |

The shape is a single Go program: a local HTTP service that serves a
React/TypeScript frontend, wrapped in a Wails v3 webview shell for the desktop
release. No CGo anywhere — a property the backend and FFmpeg choices deliberately
preserve for trivial 3-OS cross-compilation.

## 2. Backend — Go

- **Why Go.** The heavy lifting is all backend: content hashing, pHash, FFmpeg
  thumbnail/frame jobs, SQLite, filesystem watching. Go's concurrency model
  (goroutines + a shared resource budget) maps directly onto the yield-aware
  background-job scheduler (D14), and the binary is fast-starting and
  low-idle-footprint — matching "fast and quiet."
- **Version.** Go ≥ 1.26, the floor set by Wails v3 (D35).
- **Cross-compile.** `GOOS`/`GOARCH` produce the three targets; with no CGo this
  needs no per-target C toolchain (D32, D33).

## 3. Desktop shell — Wails v3

- **Wails v3.0.0** (stable 2026-10-26). Chosen over v2 because its first-class
  features map onto settled needs: **multiple windows** (the detached inspector,
  D7), **native file drag-drop** with real paths (import/inbox, D3/D16),
  **server build mode** (run the same app as an HTTP service), native menus/tray/
  dialogs, and official cross-OS packaging (D35).
- **Webview per OS.** Windows WebView2, macOS WKWebView, Linux WebKitGTK
  (GTK4 + WebKitGTK 6.0 default). The webview is the one per-OS dependency and
  the primary cross-platform test risk — WebKitGTK is historically the weakest of
  the three; the 60 fps virtualized grid must be validated there explicitly
  (D14, D35).
- **Two run modes, one codebase (D31):**
  - *Prototype:* the Go service runs and the frontend loads in a browser tab.
  - *v1:* wrapped in the Wails shell (window, dock, tray).
  The frontend is identical in both; wrapping is zero-rework.

## 4. Frontend — React + TypeScript + Vite

- **React + TS**, bundled with Vite (D34). Chosen for the largest ecosystem and
  LLM familiarity on the hard parts of this bespoke UI: virtualized media grid,
  markdown notes, drag-drop, canvas region overlays.
- **Why the runtime weight doesn't matter.** No network transfer — the bundle is
  served from disk and parsed once at startup. The browsing bottleneck is image
  decode + webview GPU compositing, which is framework-independent (D34).
- **Key frontend concerns** (library picks to be finalized — see §7): virtual
  scrolling, markdown rendering, drag-and-drop ordering, canvas/SVG region
  overlay.

## 5. Storage — SQLite (pure Go)

- **`modernc.org/sqlite`** (D32). Pure Go, no CGo, **FTS5** enabled for the
  full-text search over prompt/negative prompt/note/filename/names (D23).
- A single catalog database per library, stored alongside the library root
  (single relocatable root, D13). See `03-architecture.md` for schema.
- **Thumbnails on disk**, not in the database — pre-generated, fixed sizes,
  keyed by content hash (D14 rule 1).

## 6. Media pipeline

- **Stills** (PNG, JPEG, WebP, GIF) decode in-process via Go `image` +
  `x/image` — fast on the 100k-still hot path, no per-file process spawn (D33).
- **Video, audio, animated** go through a **bundled per-OS `ffmpeg` binary**,
  shelled out (D33). Spawned process means an ffmpeg crash can't take down the
  app, and it's easy to throttle/yield to generation (D14).
- **Guaranteed formats (D19, D33):** stills PNG/JPEG/WebP; video MP4/WebM; audio
  WAV/MP3/FLAC. Other formats are best-effort and added to the tested list over
  time.
- **Hover-play (D18):** import-time extraction of a few representative frames
  into a strip; the grid cycles the strip on hover — no live decode.
- **pHash (D2):** perceptual hash at import for near-duplicate grouping.
  Candidate library: `github.com/corona10/goimagehash` (see §7).

## 7. Open items (not yet settled)

| Item | Status |
|---|---|
| Go version pin beyond the 1.26 floor | Minor — follow Wails v3 requirement |
| Frontend virtual-scroll, markdown, drag-drop, state libraries | Propose in Architecture/UI docs |
| pHash library (`goimagehash` vs alternative) | Candidate noted, not ADR'd |
| ffmpeg distribution license/build flags | LGPL build for the guaranteed set; confirm at packaging |

## 8. Zero network

GILDEX makes no network requests (D5). The only network-adjacent code is the
local HTTP service binding to loopback (the webview/server-build transport) and
opening external URLs in the system browser. The Wails v3 built-in updater is
**not** enabled by default — updates are a separate, off-by-default distribution
decision (D5).
