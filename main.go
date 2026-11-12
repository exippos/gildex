// Command gildex serves the local GILDEX catalog API and frontend.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"gildex/internal/server"
	"gildex/internal/store"
)

func main() {
	root := flag.String("root", "", "library root path")
	listen := flag.String("listen", "127.0.0.1:8080", "HTTP listen address")
	data := flag.String("data", "", "optional catalog database path (default <root>/catalog.db)")
	flag.Parse()

	lib := store.NewLibrary(*data)
	defer lib.Close()

	if *root != "" {
		if err := lib.SetRoot(*root); err != nil {
			log.Printf("gildex: cannot open library root %q: %v", *root, err)
		}
	}

	handler := server.NewHandler(lib, "frontend/dist")
	srv := &http.Server{
		Addr:              *listen,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("gildex: listening on http://%s (root: %s)", *listen, displayRoot(lib.Root()))
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("gildex: %v", err)
	}
}

func displayRoot(root string) string {
	if root == "" {
		return "(not set)"
	}
	return root
}
