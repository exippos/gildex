// Package reveal opens the OS file manager at a file, selecting it when the
// platform's file manager supports it. It is used by the local API to back an
// "Open in Explorer" / "Show in folder" action from the browser UI.
package reveal

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// timeout bounds how long an opener may run so a hung file manager cannot block
// the HTTP request that triggered it.
const timeout = 4 * time.Second

// Reveal shows absPath in the platform file manager. It returns an error when
// the path does not exist or no opener could be launched.
func Reveal(absPath string) error {
	abs, err := filepath.Abs(absPath)
	if err != nil {
		return err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("not a file: %s", abs)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	switch runtime.GOOS {
	case "windows":
		// explorer.exe takes the selection target as a single "/select,<path>"
		// argument (no space after the comma).
		return run(ctx, "explorer.exe", "/select,"+abs)
	case "darwin":
		return run(ctx, "open", "-R", abs)
	default:
		return revealLinux(ctx, abs)
	}
}

// revealLinux tries the freedesktop FileManager1 interface (which selects the
// file in Nautilus, Dolphin, Nemo, …) and falls back to opening the containing
// folder with xdg-open.
func revealLinux(ctx context.Context, abs string) error {
	u := (&url.URL{Scheme: "file", Path: abs}).String()
	if dbusSend, err := exec.LookPath("dbus-send"); err == nil {
		err := run(ctx, dbusSend,
			"--session", "--print-reply",
			"--dest=org.freedesktop.FileManager1",
			"/org/freedesktop/FileManager1",
			"org.freedesktop.FileManager1.ShowItems",
			"array:string:"+u, "string:",
		)
		if err == nil {
			return nil
		}
	}
	if xdgOpen, err := exec.LookPath("xdg-open"); err == nil {
		return run(ctx, xdgOpen, filepath.Dir(abs))
	}
	return fmt.Errorf("no file manager opener found (tried dbus-send, xdg-open)")
}

func run(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("%s timed out", name)
		}
		return err
	}
	return nil
}
