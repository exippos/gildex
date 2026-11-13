# UI reference mockups

Static, self-contained HTML mockups used as **visual references only**. They are
not the app, share no code with it, and contain no behavior — open one in a
browser and read it as a picture with CSS.

```
open design/gilded-ocean-bento-ui.html      # or drag into a browser
```

No build step, no server. The only network request is the Google Fonts
stylesheet; offline, the stacks fall back to system sans/serif.

## Catalogue

| File | Brand | Palette | Notes |
|---|---|---|---|
| `editorial-matte-bento-ui.html` | AURA | charcoal `#090909` + gold `#C5A073` | newest matte direction; closest to the current app shell |
| `scandinavian-green-gilded-bento-ui.html` | SKOG | forest `#0B120F` + brass `#D4AF72` | nearest match to the shipped `#0F1713` / `#C6A15B` tokens |
| `gilded-ocean-bento-ui.html` | AURA | ocean `#060B13` + gilt `#D4AF72` | Art-Deco sunburst emblem, strongest gilding |
| `editorial-ocean-bento-ui.html` | AURA | ocean `#060B13` + sky `#38BDF8` | cool counterpart to the matte mockup |
| `ivory-brass-bento-ui.html` | AURA | ivory `#F9F6F0` + brass `#9E7836` | light theme |
| `ivory-copper-bento-ui.html` | AURA | ivory `#FAF7F2` + copper `#A84A28` | light theme, warmest |

All six use the same bento layout language: fixed top bar, centred nav, a
spotlight/featured card, an index grid of media tiles, and an "up next" rail.
Differences are palette, depth treatment (matte vs gilt vs light), and emblem.

## Using a reference

- Pick **one** mockup per UI task and name it in the task description; don't
  blend directions or invent a seventh.
- The mockups are layout + material references, not specs. Behavior, states, and
  data come from the app and `docs/04-features.md`.
- Port tokens into `frontend/src/tokens.css` and adjust there, rather than
  copying CSS wholesale — the mockups use their own class names and placeholder
  content.

`refs/` holds texture/material reference images (glassmorphism, neumorphism,
skeuomorphism, tactile) collected while exploring surface treatments.
