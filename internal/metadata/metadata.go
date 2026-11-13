// Package metadata extracts generation metadata from PNG text chunks.
//
// Supported producers: AUTOMATIC1111 (the `parameters` tEXt chunk) and
// ComfyUI (the `prompt` / `workflow` chunks). All parsing is best-effort: a
// malformed chunk never fails an import.
package metadata

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"io"
	"os"
	"strings"
)

var pngSignature = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

// Result is the normalized metadata extracted from a file.
type Result struct {
	Prompt         *string
	NegativePrompt *string
	ModelName      *string
	Seed           *int64
	Steps          *int64
	Sampler        *string
	CFGScale       *float64
	GeneratedAt    *int64
	Width          int
	Height         int
	Extra          map[string]string
	Raw            []byte
}

func newResult() Result {
	return Result{Extra: map[string]string{}}
}

// ParseFile reads PNG metadata from path. Non-PNG files yield an empty result.
func ParseFile(path string) (Result, error) {
	f, err := os.Open(path)
	if err != nil {
		return newResult(), err
	}
	defer f.Close()
	return Parse(f)
}

// Parse reads PNG chunks from r and extracts generation metadata.
func Parse(r io.Reader) (Result, error) {
	res := newResult()

	var sig [8]byte
	if _, err := io.ReadFull(r, sig[:]); err != nil {
		return res, nil
	}
	if !bytes.Equal(sig[:], pngSignature) {
		return res, nil
	}

	chunks := map[string]string{}
	var hdr [8]byte
	for {
		if _, err := io.ReadFull(r, hdr[:]); err != nil {
			break
		}
		length := binary.BigEndian.Uint32(hdr[:4])
		typ := string(hdr[4:8])
		if length > 64<<20 {
			break
		}
		data := make([]byte, int(length))
		if _, err := io.ReadFull(r, data); err != nil {
			break
		}

		if keyword, text, ok := decodeTextChunk(typ, data); ok {
			chunks[strings.ToLower(keyword)] = text
		}

		var crc [4]byte
		if _, err := io.ReadFull(r, crc[:]); err != nil {
			break
		}
		if typ == "IEND" {
			break
		}
	}

	return fromChunks(chunks), nil
}

func decodeTextChunk(typ string, data []byte) (string, string, bool) {
	switch typ {
	case "tEXt":
		i := bytes.IndexByte(data, 0)
		if i < 0 {
			return "", "", false
		}
		return string(data[:i]), string(data[i+1:]), true
	case "zTXt":
		i := bytes.IndexByte(data, 0)
		if i < 0 || i+2 > len(data) {
			return "", "", false
		}
		text, err := inflate(data[i+2:])
		if err != nil {
			return "", "", false
		}
		return string(data[:i]), text, true
	case "iTXt":
		return decodeITXt(data)
	default:
		return "", "", false
	}
}

func decodeITXt(data []byte) (string, string, bool) {
	i := bytes.IndexByte(data, 0)
	if i < 0 {
		return "", "", false
	}
	keyword := string(data[:i])
	rest := data[i+1:]
	if len(rest) < 2 {
		return "", "", false
	}
	compressed := rest[0] == 1
	rest = rest[2:] // compression flag + method

	j := bytes.IndexByte(rest, 0) // language tag
	if j < 0 {
		return "", "", false
	}
	rest = rest[j+1:]
	j = bytes.IndexByte(rest, 0) // translated keyword
	if j < 0 {
		return "", "", false
	}
	rest = rest[j+1:]

	if !compressed {
		return keyword, string(rest), true
	}
	text, err := inflate(rest)
	if err != nil {
		return "", "", false
	}
	return keyword, text, true
}

func inflate(data []byte) (string, error) {
	zr, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	defer zr.Close()
	b, err := io.ReadAll(io.LimitReader(zr, 8<<20))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func fromChunks(chunks map[string]string) Result {
	if raw, ok := chunks["parameters"]; ok && strings.TrimSpace(raw) != "" {
		return parseA1111(raw)
	}
	if raw, ok := chunks["prompt"]; ok && strings.TrimSpace(raw) != "" {
		res := parseComfyPrompt(raw)
		if res.Prompt == nil {
			if wf, ok := chunks["workflow"]; ok && strings.TrimSpace(wf) != "" {
				if alt := parseComfyWorkflow(wf); alt.Prompt != nil {
					return alt
				}
			}
		}
		return res
	}
	if raw, ok := chunks["workflow"]; ok && strings.TrimSpace(raw) != "" {
		return parseComfyWorkflow(raw)
	}
	return newResult()
}

// --- small parsing helpers shared by the producers ---

func strPtr(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func int64Ptr(v int64) *int64 { return &v }

func float64Ptr(v float64) *float64 { return &v }

func normalizeKey(k string) string {
	k = strings.ToLower(strings.TrimSpace(k))
	k = strings.NewReplacer(" ", "_", "-", "_").Replace(k)
	return k
}
