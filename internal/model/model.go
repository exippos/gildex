// Package model holds the shared data types that cross the Go/TS IPC boundary.
// JSON tags are camelCase and MUST match the frontend types in
// frontend/src/types.ts exactly. Do not rename fields without updating both.
package model

// Kind classifies the media an item points at.
type Kind string

const (
	KindImage Kind = "image"
	KindVideo Kind = "video"
	KindAudio Kind = "audio"
)

// Status is the user-layer item status (D22).
type Status string

const (
	StatusIdea  Status = "idea"
	StatusDraft Status = "draft"
	StatusFinal Status = "final"
	StatusWIP   Status = "wip"
)

// State is the on-disk presence state (D1).
type State string

const (
	StatePresent State = "present"
	StateMissing State = "missing"
)

// OwnerType selects which entity a context-layer record belongs to (D10).
type OwnerType string

const (
	OwnerItem       OwnerType = "item"
	OwnerSession    OwnerType = "session"
	OwnerCollection OwnerType = "collection"
)

// SourceMode is how a source is (re)scanned: once = one-time import, watch =
// periodically rechecked and synced.
type SourceMode string

const (
	SourceOnce  SourceMode = "once"
	SourceWatch SourceMode = "watch"
)

// Source is an ingest-configuration entity: a media folder referenced in place.
// Distinct from the "folders" browse view (D6); see D43.
type Source struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Path       string     `json:"path"`
	Mode       SourceMode `json:"mode"`
	AddedAt    int64      `json:"addedAt"`
	LastScanAt *int64     `json:"lastScanAt"`
}

// Item is the catalog unit. Fields carry the JSON names the frontend consumes.
type Item struct {
	ID             string            `json:"id"`
	ContentHash    string            `json:"contentHash"`
	RelativePath   string            `json:"relativePath"`
	OriginPath     string            `json:"originPath"` // absolute path at last import; clue when the source is gone
	SourceID       *string           `json:"sourceId"`
	Kind           Kind              `json:"kind"`
	Format         string            `json:"format"`
	FileSize       int64             `json:"fileSize"`
	Timestamp      int64             `json:"timestamp"` // unix milliseconds (D12)
	Width          int               `json:"width"`
	Height         int               `json:"height"`
	Duration       *float64          `json:"duration"` // seconds, video/audio only
	Favorite       bool              `json:"favorite"`
	Rating         int               `json:"rating"` // 0 = unrated, else 1..5
	Status         Status            `json:"status"`
	State          State             `json:"state"`
	SessionID      *string           `json:"sessionId"`
	Prompt         *string           `json:"prompt"`
	NegativePrompt *string           `json:"negativePrompt"`
	ModelName      *string           `json:"modelName"`
	Seed           *int64            `json:"seed"`
	Steps          *int64            `json:"steps"`
	Sampler        *string           `json:"sampler"`
	CFGScale       *float64          `json:"cfgScale"`
	GeneratedAt    *int64            `json:"generatedAt"`
	ThumbnailPath  string            `json:"thumbnailPath"` // "<hash>.jpg" or "" if none
	FrameCount     int               `json:"frameCount"`    // prerendered hover-play frames, 0 = none
	Tags           []string          `json:"tags"`          // assigned tag names, never null
	Extra          map[string]string `json:"extra"`         // tier-3 metadata_kv, never null
}

// Session is a first-class time-gap cluster (D6, D20). Favorite, Rating and
// Status are group-owned triage; Tags are group tags from the shared
// vocabulary (D45).
type Session struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	StartsAt      int64    `json:"startsAt"`
	EndsAt        int64    `json:"endsAt"`
	ItemCount     int      `json:"itemCount"`
	VideoCount    int      `json:"videoCount"` // items of kind video in this session
	AudioCount    int      `json:"audioCount"` // items of kind audio in this session
	ThumbnailPath string   `json:"thumbnailPath"`
	CoverItemID   *string  `json:"coverItemId"` // user-picked label image, nil = derived
	Favorite      bool     `json:"favorite"`
	Rating        int      `json:"rating"` // 0 = unrated, else 1..5
	Status        Status   `json:"status"`
	Tags          []string `json:"tags"` // assigned group tag names, never null
	Nsfw          bool     `json:"nsfw"` // cover thumbnail item carries the NSFW tag
}

// Tag is a flat user-owned vocabulary term (D6, D23). Family is derived from
// the name: the prefix before the first ':' (e.g. "artist" for "artist:foo"),
// or "" for an ungrouped tag.
type Tag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Family    string `json:"family"`
	ItemCount int    `json:"itemCount"`
}

// TagList is the tag vocabulary plus the count of items with no tags.
type TagList struct {
	Tags     []Tag `json:"tags"`
	Untagged int   `json:"untagged"`
}

// TagImportSummary reports the outcome of merging an imported vocabulary.
type TagImportSummary struct {
	Created  int `json:"created"`
	Existing int `json:"existing"`
	Ignored  int `json:"ignored"`
}

// TagExport is the portable vocabulary file format.
type TagExport struct {
	Format     string           `json:"format"`
	Version    int              `json:"version"`
	ExportedAt int64            `json:"exportedAt"`
	Tags       []TagExportEntry `json:"tags"`
}

// TagExportEntry carries one tag. Counts and families are informational; an
// import only reads the name.
type TagExportEntry struct {
	Name      string `json:"name"`
	Family    string `json:"family,omitempty"`
	ItemCount int    `json:"itemCount"`
}

// Collection is a user-authored, ordered index (D21).
type Collection struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	ItemCount     int      `json:"itemCount"`
	VideoCount    int      `json:"videoCount"` // items of kind video in this collection
	AudioCount    int      `json:"audioCount"` // items of kind audio in this collection
	ThumbnailPath string   `json:"thumbnailPath"`
	CoverItemID   *string  `json:"coverItemId"` // user-picked label image, nil = derived
	Favorite      bool     `json:"favorite"`
	Rating        int      `json:"rating"` // 0 = unrated, else 1..5
	Status        Status   `json:"status"`
	Tags          []string `json:"tags"` // assigned group tag names, never null
	Nsfw          bool     `json:"nsfw"` // cover thumbnail item carries the NSFW tag
}

// Episode is a nested sub-group of items inside one session or collection.
// Episodes are either user-authored or auto-clustered from near-duplicate
// pHashes. Auto episodes may be rebuilt; any manual edit flips Auto to false.
type Episode struct {
	ID            string    `json:"id"`
	OwnerType     OwnerType `json:"ownerType"` // session | collection
	OwnerID       string    `json:"ownerId"`
	Label         string    `json:"label"`
	ItemCount     int       `json:"itemCount"`
	ThumbnailPath string    `json:"thumbnailPath"`
	CoverItemID   *string   `json:"coverItemId"` // user-picked cover, nil = derived
	Auto          bool      `json:"auto"`
	ItemIDs       []string  `json:"itemIds"` // ordered members, never null
}

// Note is a markdown context record (D8, D10).
type Note struct {
	ID        string    `json:"id"`
	OwnerType OwnerType `json:"ownerType"`
	OwnerID   string    `json:"ownerId"`
	Body      string    `json:"body"`
	TypeLabel string    `json:"typeLabel"`
	CreatedAt int64     `json:"createdAt"`
	UpdatedAt int64     `json:"updatedAt"`
}

// FolderNode is a directory in the browse view (D6). Directories only.
// SourceID is set for nodes under a media source and nil for library-local
// (inbox) nodes; Path is source-relative (or library-relative when SourceID is
// nil).
type FolderNode struct {
	Name      string       `json:"name"`
	Path      string       `json:"path"`
	SourceID  *string      `json:"sourceId"`
	ItemCount int          `json:"itemCount"`
	Children  []FolderNode `json:"children"`
}

// Settings carries library-scoped preferences.
type Settings struct {
	SessionGapMinutes   int    `json:"sessionGapMinutes"`
	BlurNsfw            bool   `json:"blurNsfw"`            // blur items tagged NsfwTag in the UI
	NsfwTag             string `json:"nsfwTag"`             // tag name marking an item NSFW, "" = none
	PhashThreshold      int    `json:"phashThreshold"`      // near-duplicate Hamming distance (D39)
	AutoClusterEpisodes bool   `json:"autoClusterEpisodes"` // run episode clustering after import
}

// LibraryStatus summarizes the catalog for the status endpoint.
type LibraryStatus struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Root            string `json:"root"`
	RootSet         bool   `json:"rootSet"`
	LastLibrary     string `json:"lastLibrary"`
	ItemCount       int    `json:"itemCount"`
	SessionCount    int    `json:"sessionCount"`
	TagCount        int    `json:"tagCount"`
	CollectionCount int    `json:"collectionCount"`
	SourceCount     int    `json:"sourceCount"`
	AppVersion      string `json:"appVersion"`
	SchemaVersion   int    `json:"schemaVersion"`
}

// Duplicate describes a file whose content hash was already cataloged.
type Duplicate struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Kind  Kind   `json:"kind"`
	Thumb string `json:"thumb"`
}

// ImportStatus is the async import job's progress.
type ImportStatus struct {
	Running     bool        `json:"running"`
	Total       int         `json:"total"`
	Done        int         `json:"done"`
	Stage       string      `json:"stage"`
	Error       string      `json:"error"`
	ItemsPerSec float64     `json:"itemsPerSec"` // live throughput, 0 before first item
	Duplicates  []Duplicate `json:"duplicates"`
}

// ItemPage is a slice of the item query result.
type ItemPage struct {
	Items []Item `json:"items"`
	Total int    `json:"total"`
}
