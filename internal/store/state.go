package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// App-level state that survives across runs, independent of any single library
// bundle. For now it records only the most recently opened/created library so
// the app can reopen it on the next launch ("continue where you left off").
//
// The file lives in the user config directory (e.g. ~/.config/gildex/state.json
// on Linux), not inside a library bundle, because it must exist even before a
// library is opened.
const stateFileName = "state.json"

type appState struct {
	LastLibrary string `json:"lastLibrary"`
}

// statePath returns the on-disk location of the app state file. It falls back
// to the home directory, then the current directory, if the config dir is
// unavailable.
func statePath() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		if home, herr := os.UserHomeDir(); herr == nil && home != "" {
			dir = home
		}
	}
	if dir == "" {
		dir = "."
	}
	return filepath.Join(dir, "gildex", stateFileName)
}

// loadAppState reads and decodes the app state file. A missing file is not an
// error (it yields the zero value); a corrupt file is.
func loadAppState(path string) (appState, error) {
	var s appState
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return s, err
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return appState{}, err
	}
	return s, nil
}

// saveAppState writes the app state file atomically (temp file + rename) so a
// crash mid-write never leaves a torn JSON document behind.
func saveAppState(path string, s appState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
