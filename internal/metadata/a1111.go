package metadata

import (
	"strconv"
	"strings"
	"time"
)

// parseA1111 handles the AUTOMATIC1111 `parameters` text chunk:
//
//	<prompt>
//	Negative prompt: <negative>
//	Steps: 20, Sampler: Euler a, CFG scale: 7, Seed: 123, Size: 512x512, Model: foo, ...
func parseA1111(raw string) Result {
	res := newResult()
	res.Raw = []byte(raw)

	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")

	paramIdx := -1
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "Steps:") {
			paramIdx = i
			break
		}
	}

	content := lines
	if paramIdx >= 0 {
		content = lines[:paramIdx]
	}

	negIdx := -1
	for i, line := range content {
		if strings.HasPrefix(strings.TrimSpace(line), "Negative prompt:") {
			negIdx = i
			break
		}
	}

	var prompt, negative string
	if negIdx >= 0 {
		prompt = strings.TrimSpace(strings.Join(content[:negIdx], "\n"))
		first := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(content[negIdx]), "Negative prompt:"))
		rest := content[negIdx+1:]
		negative = strings.TrimSpace(strings.Join(append([]string{first}, rest...), "\n"))
	} else {
		prompt = strings.TrimSpace(strings.Join(content, "\n"))
	}

	res.Prompt = strPtr(prompt)
	res.NegativePrompt = strPtr(negative)

	if paramIdx >= 0 {
		applyA1111Params(&res, lines[paramIdx])
	}
	return res
}

func applyA1111Params(res *Result, line string) {
	for key, value := range parseParamLine(line) {
		if value == "" {
			continue
		}
		switch key {
		case "steps":
			if n, err := strconv.ParseInt(value, 10, 64); err == nil {
				res.Steps = int64Ptr(n)
			}
		case "sampler":
			res.Sampler = strPtr(value)
		case "cfg scale", "cfg":
			if f, err := strconv.ParseFloat(value, 64); err == nil {
				res.CFGScale = float64Ptr(f)
			}
		case "seed":
			if n, err := strconv.ParseInt(value, 10, 64); err == nil {
				res.Seed = int64Ptr(n)
			}
		case "model":
			res.ModelName = strPtr(value)
		case "size":
			res.Extra["size"] = value
			if w, h, ok := parseSize(value); ok {
				res.Width, res.Height = w, h
			}
		case "model hash":
			res.Extra["model_hash"] = value
		case "created", "date":
			if ms := parseTimeValue(value); ms != nil {
				res.GeneratedAt = ms
			} else {
				res.Extra[normalizeKey(key)] = value
			}
		default:
			res.Extra[normalizeKey(key)] = value
		}
	}
}

// parseParamLine splits "Steps: 20, Sampler: Euler a, CFG scale: 7" into a
// keyed map. Tokens without a key are folded into the previous value.
func parseParamLine(line string) map[string]string {
	out := map[string]string{}
	last := ""
	for _, part := range strings.Split(line, ", ") {
		key, value, ok := strings.Cut(part, ":")
		if ok && strings.TrimSpace(key) != "" {
			key = strings.ToLower(strings.TrimSpace(key))
			out[key] = strings.TrimSpace(value)
			last = key
		} else if last != "" {
			out[last] += ", " + strings.TrimSpace(part)
		}
	}
	return out
}

func parseSize(value string) (int, int, bool) {
	parts := strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return r == 'x' || r == '×' || r == ' '
	})
	if len(parts) != 2 {
		return 0, 0, false
	}
	w, errW := strconv.Atoi(parts[0])
	h, errH := strconv.Atoi(parts[1])
	if errW != nil || errH != nil || w <= 0 || h <= 0 {
		return 0, 0, false
	}
	return w, h, true
}

func parseTimeValue(value string) *int64 {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			ms := t.UnixMilli()
			return &ms
		}
	}
	return nil
}
