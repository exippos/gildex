package store

import (
	"strconv"

	"gildex/internal/model"
)

const (
	DefaultSessionGapMinutes = 120
	MinSessionGapMinutes     = 15
	MaxSessionGapMinutes     = 1440
)

const (
	// sessionGapKey is the settings table key for the session gap preference.
	sessionGapKey = "sessionGapMinutes"
	// blurNsfwKey is the settings table key for the "blur NSFW" toggle.
	blurNsfwKey = "blurNsfw"
	// nsfwTagKey is the settings table key for the tag name that marks NSFW.
	nsfwTagKey = "nsfwTag"
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
	out := model.Settings{SessionGapMinutes: DefaultSessionGapMinutes}
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
		}
	}
	return out, rows.Err()
}

// UpdateSettings applies a partial settings update. A nil field is left as-is.
func (s *Store) UpdateSettings(sessionGapMinutes *int, blurNsfw *bool, nsfwTag *string) (model.Settings, error) {
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
