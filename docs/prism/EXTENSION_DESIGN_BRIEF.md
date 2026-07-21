# Prism — Chrome Extension Design Brief

For Figma. Describes the side panel as currently built.

## Product in one line

Prism reads the page you're already on and gives it back to you in a form that
sticks — summarized, quizzed, mapped, defined, or read aloud.

The prism is the whole metaphor: **the page you're on is the light**. It enters
the prism and disperses into five coloured ways to learn it. Every ray is one
mode, and the colour of a ray always matches its card.

## Surface

- Chrome **side panel** (not a popup), docked right, persists across tab switches
- Design width **400px**; user-resizable, so nothing may assume a fixed width
- Height is unbounded and scrolls
- Dark theme only

## Layout — the home screen, top to bottom

1. **Header** — small spectrum-gradient triangle glyph + wordmark `prism`, bottom hairline
2. **"THE PAGE YOU'RE ON"** eyebrow label
3. **Source chip** — white dot + hostname in mono (e.g. `investopedia.com`), faint outer glow so it reads as a light source. Page title below in small dim text, truncating.
4. **Readiness line** — green dot + `1,308 words analyzed`
5. **Language picker** — "Show results in" + select
6. **"CHOOSE A LEARNING MODE"** eyebrow
7. **The stage** (see below)
8. **Footnote** — "Only this active page or the text you selected is analyzed."

## The stage — the core visual

A vertical white beam falls from the top of the stage into the **apex of an
upright 3D prism**, centred horizontally. The prism is drawn as a front
triangle plus a right face and a base, offset back-and-up, so it reads as a
solid object rather than a flat triangle.

Five coloured rays leave the prism and terminate at five mode cards:

| Position | Mode | Colour | Hint |
|---|---|---|---|
| Left of prism | **Quiz me** | `--ray-2` orange | Answer first, then see why |
| Right of prism | **Listen** | `--ray-5` blue | Read aloud at your pace |
| Below, staggered left | **Summarize** | `--ray-1` red | The page in a few clear points |
| Below, staggered centre | **Key terms** | `--ray-3` yellow | The concepts that matter most |
| Below, staggered right | **Visualize** | `--ray-4` green | One map of the whole idea |

Rules that matter:

- The two **side cards are narrow**, so they hold the modes with the shortest
  hint text. Summarize sits below because its line is longer.
- The three **bottom cards are 64% width**, staggered left / centre / right.
  Full-width cards left no air around the rays and looked tangled.
- Bottom rays leave from **evenly spaced points across the prism's base** and
  land on each card's top centre — equal exits give equal angles.
- Side rays leave the prism's core and meet the **inner vertical edge** of their
  card at mid-height.
- **Cards paint above the rays**, so light reads as passing behind them.
- Ray geometry is computed at runtime from where the cards actually land, and
  redrawn on resize. Do not hard-code ray coordinates.

## Interaction

- **Hover a card** → its ray goes to full width and opacity; the other four dim
  to 30%. The card lifts slightly.
- **Click a card** → the stage is replaced by that mode's result view, with a
  "← Back to the prism" control.
- `prefers-reduced-motion` kills the travelling spark on the beam.

## Tokens

```
--bg        #07080f    page
--surface   #12162a    cards
--surface-2 #1a2040    hover / raised
--ink       #eef1ff    primary text
--muted     #8b93b8    hint text
--dim       #5f678f    eyebrows, notes
--line      #242b4d    borders

--ray-1 #ff5f6d  red      Summarize
--ray-2 #ff9f45  orange   Quiz me
--ray-3 #ffd93d  yellow   Key terms
--ray-4 #3ddc97  green    Visualize
--ray-5 #4aa8ff  blue     Listen
--ray-6 #a06bff  violet   accent / focus ring
```

Background is `--bg` plus a soft radial glow behind the prism.

Type: system UI stack, 14px/1.5 base. Card label 13.5px/600, hint 11.5px,
eyebrow 9.5px uppercase with 0.12em tracking, source chip in monospace.

Cards: 10px radius, 1px `--line` border. Each card carries a 3px vertical
colour bar on its inner edge matching its ray.

## Result views (inside the same panel)

Each mode replaces the stage. Shared furniture: the source chip stays at top,
a bordered result container, and a back control.

- **Quiz** — questions with radio options; selected option gets a violet border.
  On submit: score, per-question ✓/✗ with explanation, mastery %, next hint.
- **Locked state** — amber-bordered card, "Locked until you try". This is the
  product's core argument made visible: the worked solution is withheld by the
  server until an attempt is recorded.
- **Summarize / Key terms / Visualize / Listen** — list, chip, node-map and
  playback treatments respectively.

## What still needs design help

1. The prism silhouette — is the current 3D triangle convincing enough at 400px?
2. The green Visualize ray clips the corner of the Key terms card on its way past.
3. Result views were built functionally and have had no design pass.
4. No empty, loading, or error illustrations — only text states today.
5. Behaviour below ~320px and above ~600px panel width is undefined.
