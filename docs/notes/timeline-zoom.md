# Timeline zoom — handover

A horizontal, zoomable, panable timeline that backs the **Timeline** surface. It
replaces the item grid when `surface === 'timeline'`.

## Files

| File | Role |
|---|---|
| `frontend/src/components/timeline/TimelineCanvas.tsx` | Component (all logic) |
| `frontend/src/components/timeline/timeline-canvas.css` | Styles (tokens only) |
| `frontend/src/components/layout/Layout.tsx` | Wires it in: `surface === 'timeline' ? <TimelineCanvas/> : <Grid/>` |

## Pipeline (data → pixels)

1. `store.items` (already filtered by search/tags/sort) → sorted by `timestamp` ascending.
2. **Quantize** into 1-hour buckets: `startMs = floor(timestamp / HOUR_MS) * HOUR_MS`.
3. **Broken-axis layout** (`buildLayout`): walk buckets left→right, assign each a
   content-x. Gaps between buckets wider than `COLLAPSE_MS` collapse into a fixed-width
   **break node**; smaller gaps stay linear (`x += gap * scale`).
4. **Render** nodes near the viewport only (`screenX = node.x - scrollX`).

## Camera (zoom + pan)

- State `{ scale, scrollX }` — `scale` = px per ms of *linear* time; `scrollX` = px scroll.
- **Pan** (drag): `scrollX -= dx`, clamped to `[0, totalW - width]`.
- **Zoom** (wheel, centered on cursor; or `−`/`+` buttons around center): scales
  `scale`, then anchors proportionally so the content point under the cursor keeps its
  fractional position.
- **Fit** (button + auto-fit on data change): solve the affine width for `scale`.

## Key formulas

```
totalW = 2*PAD + numBreaks*BREAK_W + linearMs*scale        // affine in scale
fitScale = (width - 2*PAD - numBreaks*BREAK_W) / linearMs  // solve totalW == width
```

## Adaptive density + zoom-scaled stacks

- `hourPx = HOUR_MS * scale`.
- `hourPx >= minStack + 6` → **fanned stack** per bucket (up to 4 overlapping layers).
- Otherwise → **histogram** (one bar per hour, height ∝ item count).

Stack size grows with zoom to fill the gap to the next bucket:

```
minStack = clamp(cellSize * 0.35, 28, 64)
size     = clamp((next.startMs - startMs) * scale - STACK_GAP, minStack, MAX_STACK)
           // minStack when it's the last bucket or followed by a collapsed break
```

## Parameters (tune here)

| Constant | Value | Meaning |
|---|---|---|
| `HOUR_MS` | 3 600 000 | quantization bucket size (1 h) |
| `COLLAPSE_MS` | 2 h | gaps wider than this collapse into a break |
| `BREAK_W` | 44 px | fixed width of a collapsed-gap marker |
| `MAX_STACK` | 240 px | cap on stack size when zoomed in |
| `STACK_GAP` | 12 px | breathing room between stack and next bucket |
| `MAX_LAYERS` / `LAYER_OFFSET` | 4 / 3 px | fan depth and diagonal offset |
| `LABEL_MIN_HOUR_PX` | 48 px | show per-stack time/date labels once an hour is this wide |
| `MIN/MAX_PX_PER_MS` | 1e-7 / 1 | zoom clamp |

## Interactions

Wheel = zoom · drag empty space = pan · `−`/`+`/`fit` = controls · click stack =
quick-preview newest item · double-click = open inspector.

## Notes / known trade-offs

- The axis is **non-linear**: empty stretches are elided, so there is no continuous time
  ruler. Orientation comes from break markers (elapsed duration) + per-stack time/date labels.
- Session bands were removed (linear time ranges are meaningless on a broken axis).
- The "fit" solve is exact because `totalW` is affine in `scale`; no iteration needed.
- Stack fan extends a few px beyond `size`; `STACK_GAP` keeps adjacent stacks from touching.
