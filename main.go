// Command gildex serves the local GILDEX catalog API and frontend.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gildex/internal/server"
	"gildex/internal/store"
	"gildex/internal/watch"
)

func main() {
	library := flag.String("library", "", "library bundle path (.gildex directory)")
	listen := flag.String("listen", "127.0.0.1:8080", "HTTP listen address")
	data := flag.String("data", "", "optional catalog database path (default <library>/catalog.db)")
	flag.Parse()

	lib := store.NewLibrary(*data)
	defer lib.Close()

	if *library != "" {
		if err := lib.OpenLibrary(*library); err != nil {
			log.Printf("gildex: cannot open library %q: %v", *library, err)
		}
	}

	handler := server.NewHandler(lib, "frontend/dist")
	srv := &http.Server{
		Addr:              *listen,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go watch.New(lib, time.Minute).Run(ctx)

	go func() {
		log.Printf("gildex: listening on http://%s (library: %s)", *listen, displayLibrary(lib))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("gildex: %v", err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Printf("gildex: shutting down")
	if err := srv.Shutdown(context.Background()); err != nil {
		log.Printf("gildex: shutdown: %v", err)
	}
}

func displayLibrary(lib *store.Library) string {
	if lib.Root() == "" {
		return "(none — create or open a library in the UI)"
	}
	return lib.Root()
}
