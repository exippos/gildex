package store

import (
	"strconv"
	"strings"

	"gildex/internal/model"
)

const (
	DefaultSessionGapMinutes = 120
	MinSessionGapMinutes     = 15
	MaxSessionGapMinutes     = 1440
)

const (
	// DefaultPhashThreshold is the default near-duplicate Hamming distance.
	DefaultPhashThreshold = 10
	MinPhashThreshold     = 0
	MaxPhashThreshold     = 64
)

const (
	// sessionGapKey is the settings table key for the session gap preference.
	sessionGapKey = "sessionGapMinutes"
	// blurNsfwKey is the settings table key for the "blur NSFW" toggle.
	blurNsfwKey = "blurNsfw"
	// nsfwTagKey is the settings table key for the tag name that marks NSFW.
	nsfwTagKey = "nsfwTag"
	// phashThresholdKey is the settings table key for the episode near-dup
	// Hamming distance.
	phashThresholdKey = "phashThreshold"
	// autoClusterEpisodesKey is the settings table key for the opt-in automatic
	// episode clustering after import.
	autoClusterEpisodesKey = "autoClusterEpisodes"
)

// setSetting upserts a single key/value row in the settings table.
func (s *Store) setSetting(key, value string) error {
	_, err := s.db.Exec(`
		INSERT INTO settings(key, value) VALUES(?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// Settings returns the library-scoped preferences. Missing keys fall back to
// the defaults; a stored value that is unparseable or out of range is treated
// as absent rather than an error.
func (s *Store) Settings() (model.Settings, error) {
	out := model.Settings{
		SessionGapMinutes: DefaultSessionGapMinutes,
		PhashThreshold:    DefaultPhashThreshold,
	}
	rows, err := s.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return out, err
		}
		switch key {
		case sessionGapKey:
			if n, err := strconv.Atoi(value); err == nil && n >= MinSessionGapMinutes && n <= MaxSessionGapMinutes {
				out.SessionGapMinutes = n
			}
		case blurNsfwKey:
			out.BlurNsfw = value == "1"
		case nsfwTagKey:
			out.NsfwTag = value
		case phashThresholdKey:
			if n, err := strconv.Atoi(value); err == nil && n >= MinPhashThreshold && n <= MaxPhashThreshold {
				out.PhashThreshold = n
			}
		case autoClusterEpisodesKey:
			out.AutoClusterEpisodes = value == "1"
		}
	}
	return out, rows.Err()
}

// UpdateSettings applies a partial settings update. A nil field is left as-is.
func (s *Store) UpdateSettings(sessionGapMinutes *int, blurNsfw *bool, nsfwTag *string, phashThreshold *int, autoClusterEpisodes *bool) (model.Settings, error) {
	if sessionGapMinutes != nil {
		if *sessionGapMinutes < MinSessionGapMinutes || *sessionGapMinutes > MaxSessionGapMinutes {
			return model.Settings{}, invalid("session gap must be between 15 and 1440 minutes")
		}
		if err := s.setSetting(sessionGapKey, strconv.Itoa(*sessionGapMinutes)); err != nil {
			return model.Settings{}, err
		}
	}
	if blurNsfw != nil {
		value := "0"
		if *blurNsfw {
			value = "1"
		}
		if err := s.setSetting(blurNsfwKey, value); err != nil {
			return model.Settings{}, err
		}
	}
	if nsfwTag != nil {
		if err := s.setSetting(nsfwTagKey, *nsfwTag); err != nil {
			return model.Settings{}, err
		}
	}
	if phashThreshold != nil {
		if *phashThreshold < MinPhashThreshold || *phashThreshold > MaxPhashThreshold {
			return model.Settings{}, invalid("pHash threshold must be between 0 and 64")
		}
		if err := s.setSetting(phashThresholdKey, strconv.Itoa(*phashThreshold)); err != nil {
			return model.Settings{}, err
		}
	}
	if autoClusterEpisodes != nil {
		value := "0"
		if *autoClusterEpisodes {
			value = "1"
		}
		if err := s.setSetting(autoClusterEpisodesKey, value); err != nil {
			return model.Settings{}, err
		}
	}
	return s.Settings()
}

// SessionGapMS returns the configured session gap in milliseconds. A settings
// read failure falls back to the default gap.
func (s *Store) SessionGapMS() int64 {
	settings, err := s.Settings()
	if err != nil {
		settings = model.Settings{SessionGapMinutes: DefaultSessionGapMinutes}
	}
	return int64(settings.SessionGapMinutes) * 60_000
}

// groupNsfwTag returns the tag name that marks an item NSFW, or "" when no tag
// is configured. It intentionally ignores BlurNsfw: a group's Nsfw flag records
// only whether its cover thumbnail carries the tag, while the UI decides when
// to blur based on the BlurNsfw toggle. A settings read failure disables the
// flag.
func (s *Store) groupNsfwTag() string {
	settings, err := s.Settings()
	if err != nil {
		return ""
	}
	return settings.NsfwTag
}

// nsfwThumbSet returns the subset of itemIDs whose assigned tags include the
// NSFW tag (case-insensitive). An empty tag or id set yields an empty set.
func (s *Store) nsfwThumbSet(itemIDs []string, nsfwTag string) (map[string]bool, error) {
	out := map[string]bool{}
	if nsfwTag == "" || len(itemIDs) == 0 {
		return out, nil
	}
	tags, err := s.loadTags(itemIDs)
	if err != nil {
		return nil, err
	}
	for id, names := range tags {
		if hasTagFold(names, nsfwTag) {
			out[id] = true
		}
	}
	return out, nil
}

func hasTagFold(names []string, target string) bool {
	if target == "" {
		return false
	}
	for _, n := range names {
		if strings.EqualFold(n, target) {
			return true
		}
	}
	return false
}
