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

// Item is the catalog unit. Fields carry the JSON names the frontend consumes.
type Item struct {
	ID             string            `json:"id"`
	ContentHash    string            `json:"contentHash"`
	RelativePath   string            `json:"relativePath"`
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
	Extra          map[string]string `json:"extra"`         // tier-3 metadata_kv, never null
}

// Session is a first-class time-gap cluster (D6, D20).
type Session struct {
	ID            string  `json:"id"`
	Label         string  `json:"label"`
	StartsAt      int64   `json:"startsAt"`
	EndsAt        int64   `json:"endsAt"`
	ItemCount     int     `json:"itemCount"`
	ThumbnailPath string  `json:"thumbnailPath"`
	CoverItemID   *string `json:"coverItemId"` // user-picked label image, nil = derived
}

// Tag is a flat user-owned vocabulary term (D6, D23).
type Tag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ItemCount int    `json:"itemCount"`
}

// TagList is the tag vocabulary plus the count of items with no tags.
type TagList struct {
	Tags     []Tag `json:"tags"`
	Untagged int   `json:"untagged"`
}

// Collection is a user-authored, ordered index (D21).
type Collection struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	ItemCount     int     `json:"itemCount"`
	ThumbnailPath string  `json:"thumbnailPath"`
	CoverItemID   *string `json:"coverItemId"` // user-picked label image, nil = derived
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
type FolderNode struct {
	Name      string       `json:"name"`
	Path      string       `json:"path"`
	ItemCount int          `json:"itemCount"`
	Children  []FolderNode `json:"children"`
}

// LibraryStatus summarizes the catalog for the status endpoint.
type LibraryStatus struct {
	Root            string `json:"root"`
	RootSet         bool   `json:"rootSet"`
	ItemCount       int    `json:"itemCount"`
	SessionCount    int    `json:"sessionCount"`
	TagCount        int    `json:"tagCount"`
	CollectionCount int    `json:"collectionCount"`
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
	Running    bool        `json:"running"`
	Total      int         `json:"total"`
	Done       int         `json:"done"`
	Stage      string      `json:"stage"`
	Error      string      `json:"error"`
	Duplicates []Duplicate `json:"duplicates"`
}

// ItemPage is a slice of the item query result.
type ItemPage struct {
	Items []Item `json:"items"`
	Total int    `json:"total"`
}
