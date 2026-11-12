package metadata

import (
	"encoding/json"
	"strconv"
	"strings"
)

// comfyNode is one node of a ComfyUI API-format prompt graph.
type comfyNode struct {
	ClassType string                     `json:"class_type"`
	Inputs    map[string]json.RawMessage `json:"inputs"`
	Meta      struct {
		Title string `json:"title"`
	} `json:"_meta"`
}

// parseComfyPrompt parses the API graph stored in the `prompt` chunk.
func parseComfyPrompt(raw string) Result {
	res := newResult()
	res.Raw = []byte(raw)

	var nodes map[string]comfyNode
	if err := json.Unmarshal([]byte(raw), &nodes); err != nil {
		return res
	}

	var sampler *comfyNode
	for id := range nodes {
		n := nodes[id]
		if n.Inputs == nil {
			continue
		}
		if _, pos := n.Inputs["positive"]; pos {
			if _, neg := n.Inputs["negative"]; neg {
				copied := n
				sampler = &copied
				break
			}
		}
		if sampler == nil && strings.Contains(strings.ToLower(n.ClassType), "ksampler") {
			copied := n
			sampler = &copied
		}
	}

	var positive, negative string
	if sampler != nil {
		if v, ok := sampler.Inputs["positive"]; ok {
			positive = resolveComfyText(nodes, v, 0)
		}
		if v, ok := sampler.Inputs["negative"]; ok {
			negative = resolveComfyText(nodes, v, 0)
		}
		applyComfySampler(&res, sampler.Inputs)
	}

	// Fall back to CLIPTextEncode node titles when the sampler links failed.
	if positive == "" || negative == "" {
		for id := range nodes {
			n := nodes[id]
			if !strings.Contains(n.ClassType, "CLIPTextEncode") {
				continue
			}
			text := ""
			for _, key := range []string{"text", "string"} {
				if v, ok := n.Inputs[key]; ok {
					if text = resolveComfyText(nodes, v, 0); text != "" {
						break
					}
				}
			}
			if text == "" {
				continue
			}
			title := strings.ToLower(n.Meta.Title)
			switch {
			case strings.Contains(title, "negative"):
				if negative == "" {
					negative = text
				}
			case strings.Contains(title, "positive"):
				if positive == "" {
					positive = text
				}
			}
		}
	}

	res.Prompt = strPtr(positive)
	res.NegativePrompt = strPtr(negative)

	if res.ModelName == nil {
		res.ModelName = findCheckpoint(nodes)
	}
	return res
}

func applyComfySampler(res *Result, inputs map[string]json.RawMessage) {
	if inputs == nil {
		return
	}
	if f, ok := rawFloat(inputs["seed"]); ok {
		res.Seed = int64Ptr(int64(f))
	} else if f, ok := rawFloat(inputs["noise_seed"]); ok {
		res.Seed = int64Ptr(int64(f))
	}
	if f, ok := rawFloat(inputs["steps"]); ok {
		res.Steps = int64Ptr(int64(f))
	}
	if f, ok := rawFloat(inputs["cfg"]); ok {
		res.CFGScale = float64Ptr(f)
	}
	if s, ok := rawString(inputs["sampler_name"]); ok {
		res.Sampler = strPtr(s)
	}
}

// resolveComfyText resolves a value that is either a literal string or a
// [nodeId, outputIndex] link to a node whose `text` input holds the prompt.
func resolveComfyText(nodes map[string]comfyNode, raw json.RawMessage, depth int) string {
	if depth > 16 || len(raw) == 0 {
		return ""
	}
	if s, ok := rawString(raw); ok {
		return s
	}
	var link []json.RawMessage
	if err := json.Unmarshal(raw, &link); err != nil || len(link) != 2 {
		return ""
	}
	var id string
	if err := json.Unmarshal(link[0], &id); err != nil {
		return ""
	}
	node, ok := nodes[id]
	if !ok {
		return ""
	}
	for _, key := range []string{"text", "string", "value", "prompt"} {
		if v, ok := node.Inputs[key]; ok {
			if text := resolveComfyText(nodes, v, depth+1); text != "" {
				return text
			}
		}
	}
	return ""
}

func findCheckpoint(nodes map[string]comfyNode) *string {
	for id := range nodes {
		n := nodes[id]
		if !strings.Contains(strings.ToLower(n.ClassType), "checkpoint") {
			continue
		}
		if v, ok := n.Inputs["ckpt_name"]; ok {
			if s, ok := rawString(v); ok && s != "" {
				return &s
			}
		}
	}
	for id := range nodes {
		n := nodes[id]
		if v, ok := n.Inputs["ckpt_name"]; ok {
			if s, ok := rawString(v); ok && s != "" {
				return &s
			}
		}
	}
	return nil
}

func rawString(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "", false
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", false
	}
	return s, true
}

func rawFloat(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f, true
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if v, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return v, true
		}
	}
	return 0, false
}

// --- UI workflow format (best-effort fallback) ---

type comfyWorkflow struct {
	Nodes []struct {
		Type          string            `json:"type"`
		Title         string            `json:"title"`
		WidgetsValues []json.RawMessage `json:"widgets_values"`
	} `json:"nodes"`
}

func parseComfyWorkflow(raw string) Result {
	res := newResult()
	res.Raw = []byte(raw)

	var wf comfyWorkflow
	if err := json.Unmarshal([]byte(raw), &wf); err != nil {
		return res
	}

	var positive, negative string
	for _, n := range wf.Nodes {
		switch {
		case strings.Contains(n.Type, "CLIPTextEncode") && len(n.WidgetsValues) > 0:
			text, _ := rawString(n.WidgetsValues[0])
			title := strings.ToLower(n.Title)
			switch {
			case strings.Contains(title, "negative"):
				if negative == "" {
					negative = text
				}
			case strings.Contains(title, "positive"):
				if positive == "" {
					positive = text
				}
			case positive == "":
				positive = text
			case negative == "":
				negative = text
			}
		case strings.Contains(strings.ToLower(n.Type), "checkpoint") && len(n.WidgetsValues) > 0:
			if res.ModelName == nil {
				if s, ok := rawString(n.WidgetsValues[0]); ok && s != "" {
					res.ModelName = &s
				}
			}
		case strings.Contains(strings.ToLower(n.Type), "ksampler") && len(n.WidgetsValues) >= 5:
			if f, ok := rawFloat(n.WidgetsValues[0]); ok {
				res.Seed = int64Ptr(int64(f))
			}
			if f, ok := rawFloat(n.WidgetsValues[2]); ok {
				res.Steps = int64Ptr(int64(f))
			}
			if f, ok := rawFloat(n.WidgetsValues[3]); ok {
				res.CFGScale = float64Ptr(f)
			}
			if s, ok := rawString(n.WidgetsValues[4]); ok {
				res.Sampler = strPtr(s)
			}
		}
	}

	res.Prompt = strPtr(positive)
	res.NegativePrompt = strPtr(negative)
	return res
}
