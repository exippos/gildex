# TODO
- [X] Keyboard navigation
- [ ] Nested grouping (very similar images or manual order) -- episodes
- [ ] Local reorder in collection
- [ ] Hide drafts toggle
- [ ] Add "sorted" flag for collections
- [ ] Drag-n-Drop reorder inside collections 
- [ ] Mested sub-collections (sub-groups for very similar images)
- [ ] Remove/Edit tag
- [ ] Undo feature

# Features
- [ ] Timeline propper management
- [ ] Collection creation master
- [ ] Subsessions (groups visually similar images inside a session or a collection)

## UX

- [ ] Animated images badge
- [ ] Thumbnails too low resolution
- [ ] Item metadata on hover (rating, status, etc)
- [X] Open last


## Sort
- [X] Sort by rating, status, favorite
- [ ] Sort by group name 
- [ ] Sort nesting groups -> group items
- [ ] Sort Asc/Desc resets grid view (collapses all expanded items)

## Tags
- [X] Add multiple tags at once (do not close tagging menu after adding a tag)
- [ ] On tag list (on the side panel), the "clear N active" should not move the tag list.
- [X] Add "untagged" tag
- [X] Make tags lines in right side panel smaller vertically, very compact list "> tag 545"
- [X] Import/Export tag list
- [X] Tag family colours (derived from the family name)
- [ ] Add "blur" setting on specific tag (rating:explicit)


## Settings menu
- [X] Settings menu
    - [X] Header gear + compact theme picker
    - [X] Appearance: theme, effects, grid zoom (device-local)
    - [X] Library: info, versions, counts, create/open
    - [X] Sources: shared manager with Ingest
    - [X] Behavior: session gap (library-local) + apply & recluster
    - [X] About
    - [X] Group tiles: single click previews, double-click expands (Settings → Appearance)
    - [ ] pHash similarity threshold (with near-duplicate grouping)
    - [ ] Protect manual session assignments across recluster
- [ ] Add "indexed fields" settings, to be able to tune the search mechanics
- [ ] Setting icon -> gear

## Group items
- [X] "Select" all items in group for batch operations
- [X] Collection/Session Edit
    - [X] Drag items to create collections
    - [X] Edit name, remove items from session/collection, add files to session manually
    - [X] Set an image as a group item image lable
    - [X] Side panel "edit" button bad placement
- [X] Tags, triage, etc for group items
- [X] Batch operations preview side panel
- [X] Expand behavior setting (expand on double click)
- [X] Do not cut thumbnails to fit a square -- black bars (Settings → Appearance)

## Library (Left side-panel)
- [X] Left side panel for session view thumbnails
- [X] Collapsible side panels controlls
- [ ] Session split for AI gen and regular media (based on ai gen metadata)
    - [ ] Left side panel for session view split into AI/regular

## Preview (right side-panel)
- [X] Preview (right side) panel refocus
    - [X] Focus on filename, triage (rating/type/favorite), metadata (timestamp, resolution), gen param, prompts
    - [X] Tags field

## UI Layout
- [X] Maximise vertical spave on gallery view
    - [X] Remove Session|collection|folders|tags from gallery view
    - [X] Remove footer
    - [X] Move search bar into a header
    - [X] Make header smaller (or dynamically enlarge on hover)
- [X] Ingest | Gallery | Timeline tabs


## Navigation
- [ ] Add "show triage/filename to navigation bar

# Core
- [X] Library creation: File -> New -> Library Creation Wizard (.gildex directory bundle + manifest + system dirs)
- [X] Video support
    - [X] Animated animations on hover
- [X] Save media path as metadata (and show on missing items)
- [/] Missing items
    - [X] Missing items grayed-out original thumbnail
    - [ ] Relocate missing items option
    - [ ] Flag "missing" items after rescan (if not found on disk) 
- [X] Remember last selected session/collection/folder on tab change

## Ingest
- [ ] Sessions only for generated items (decided by metadata)
- [X] Drag-n-Drop ingest
- [ ] Add "stop" ingest button
- [X] Ingest duplication thumbnails + links to existing files
    -[ ] In the "Found duplicate" message show both filenames
- [X] Media sources: add/remove, once vs watch toggle, rescan
- [X] Background source watcher (polling; fsnotify is v1 hardening)

## Flair
- [/] Animations
- [ ] Material shaders
- [ ] Glass shaders


