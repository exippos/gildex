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

// sessionGapKey is the settings table key for the session gap preference.
const sessionGapKey = "sessionGapMinutes"

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
		if key != sessionGapKey {
			continue
		}
		n, err := strconv.Atoi(value)
		if err != nil || n < MinSessionGapMinutes || n > MaxSessionGapMinutes {
			continue
		}
		out.SessionGapMinutes = n
	}
	return out, rows.Err()
}

// UpdateSettings applies a partial settings update. A nil field is left as-is.
func (s *Store) UpdateSettings(sessionGapMinutes *int) (model.Settings, error) {
	if sessionGapMinutes == nil {
		return s.Settings()
	}
	if *sessionGapMinutes < MinSessionGapMinutes || *sessionGapMinutes > MaxSessionGapMinutes {
		return model.Settings{}, invalid("session gap must be between 15 and 1440 minutes")
	}
	if _, err := s.db.Exec(`
		INSERT INTO settings(key, value) VALUES('sessionGapMinutes', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		strconv.Itoa(*sessionGapMinutes)); err != nil {
		return model.Settings{}, err
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
