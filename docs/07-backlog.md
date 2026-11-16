# 0. Features
- [ ] Timeline propper management
- [ ] Collection creation master
- [ ] Subsessions (groups visually similar images inside a session or a collection)

# 1. Core
- [X] Library creation: File -> New -> Library Creation Wizard (.gildex directory bundle + manifest + system dirs)
- [ ] Video support
    - [ ] Animated animations on hover
    - [ ]

## 1.1 Ingest
- [ ] Sessions only for generated items (decided by metadata)
- [X] Drag-n-Drop ingest
- [X] Ingest | Gallery | Timeline tabs
- [X] Ingest duplication thumbnails + links to existing files
    -[ ] In the "Found duplicate" message show both filenames
- [X] Media sources: add/remove, once vs watch toggle, rescan
- [X] Background source watcher (polling; fsnotify is v1 hardening)

# 2. UX
## 2.1 Gallery
- [ ] Keyboard navigation
- [ ] Animated images badge
- [ ] Thumbnails too low resolution
- [ ] Item metadata on hover (rating, status, etc) 
- [X] "ALL" view
- [X] Maximise vertical spave on gallery view
    - [X] Remove Session|collection|folders|tags from gallery view
    - [X] Remove footer
    - [X] Move search bar into a header
    - [X] Make header smaller (or dynamically enlarge on hover)
- [X] Sessions collapsed view (Collapsed by default, expand on click)
    - [X] Grid items instead of list
- [X] Left side panel for session view thumbnails
- [X] Collapsible side panels controlls
- [ ] Session split for AI gen and regular media (based on ai gen metadata)
    - [ ] Left side panel for session view split into AI/regular
- [X] Open last
- [X] Preview (right side) panel refocus
    - [X] Focus on filename, triage (rating/type/favorite), metadata (timestamp, resolution), gen param, prompts
    - [X] Tags field
- [X] Batch operations preview side panel
    - [X] Batch tags 
- [X] Save media path as metadata (and show on missing items)
- [ ] Missing items
    - [X] Missing items grayed-out original thumbnail
    - [ ] Relocate missing items option
    - [ ] Flag "missing" items after rescan (if not found on disk) 

- [ ] Setting icon -> gear
- [ ] Remove theme change pick from header
- [ ] Add "stop" ingest button

### 2.2 Group items
- [ ] "Select" all items in group for batch operations
- [X] Collection/Session Edit
    - [X] Drag items to create collections
    - [X] Edit name, remove items from session/collection, add files to session manually
    - [X] Set an image as a group item image lable
    - [ ] Side panel "edit" button bad placement

### 2.3 Tags
- [ ] Add multiple tags at once (do not close tagging menu after adding a tag)
- [ ] On tag list (on the side panel), the "clear N active" should not move the tag list.
- [X] Add "untagged" tag
- [X] Make tags lines in right side panel smaller vertically, very compact list "> tag 545"
- [X] Import/Export tag list

### Settings menu
- [X] Settings menu
    - [X] Header gear + compact theme picker
    - [X] Appearance: theme, effects, grid zoom (device-local)
    - [X] Library: info, versions, counts, create/open
    - [X] Sources: shared manager with Ingest
    - [X] Behavior: session gap (library-local) + apply & recluster
    - [X] About
    - [ ] pHash similarity threshold (with near-duplicate grouping)
    - [ ] Protect manual session assignments across recluster

### Other



# 3 Flair
- [ ] Animations
- [ ] Material shaders
- [ ] Glass shaders

## 2.2 Bugs
- [ ] Sort Asc/Desc resets grid view (collapses all expanded items)


# 3. Design