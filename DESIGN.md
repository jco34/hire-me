# hire-me / Design System

This document is the binding visual contract for the application. Every agent and every
future change works from this file. If a decision is not written here, it is not decided.

Source brief captured from https://rechroma.com/ on 30 July 2026. Provenance only. We work
from the description below, never from memory of that site, and we work in its *spirit*
rather than reproducing it.

---

## 1. The governing idea

The brief describes a colour product that opens in no colour at all. Ours is not a colour
product, so we translate the *argument*, not the subject:

> **The page demonstrates its system instead of describing it.**

For rechroma the unit was the square cell of a generative grid. We keep exactly that. Every
piece of display type in this application is drawn from the same square cell, rendered as
solid tiles at display size and as a loose stipple at reading size. The wordmark is not an
image and not a font file. It is data plus a renderer, and the same renderer draws the
subhead. That is the whole point, and it is not negotiable.

The second inherited idea is **restraint bought back with one warm object**. The interface is
a flat, matte, almost colourless grey field. Exactly one element on any given screen looks
pressable: a slightly lighter capsule with a hairline border and a hard offset drop shadow.
Everything else is flat. When two things on a screen compete to look pressable, one of them
is wrong.

The third is **motion as craft, not spectacle**. Motion is pervasive and it is also the first
thing to go under `prefers-reduced-motion`. A design that only impresses when the animation
runs has failed.

---

## 2. Legibility ruling (read this before you argue with it)

The brief accepts a real cost: "the dotted subhead barely holds against the grey". That is a
deliberate trade on a marketing page with roughly forty words on it.

**This application is a dense data tool.** A stipple face applied to a sortable table of
salary figures would not be a bold trade, it would be a defect. So the system splits:

| Register | Where it applies | Face |
|---|---|---|
| **Display** | Wordmark, hero, page titles, section headers, empty states, big numerics | Tile renderer, solid mode |
| **Sub-display** | Hero subhead, kicker labels, scroll cue, marginal captions | Tile renderer, stipple mode |
| **Reading** | Table cells, form fields, notes, timeline entries, anything you must actually read | Real monospace, wide tracking, generous leading |

**Exception:** the app shell's `PageHeader` kicker (record counts, route breadcrumbs, e.g.
"12 applications") is drawn by the tile renderer in **solid** mode at `--ink`, not stipple.
Nothing else on screen restates that count, so section 10's stipple-exception clause does not
cover it — stipple at `--muted` measured 1.89:1 and was functionally invisible. Solid `--ink`
keeps the tile face (same generative grid as the title) while reading at 10.89:1.

The reading face inherits the *character* of the brief's body type (monospaced feeling, wide
even tracking, generous leading, mixed case, low contrast against the grey) without inheriting
its stipple rendering. The brief's legibility cost is paid in the hero, where it buys
something. It is not paid in the table, where it would only cost.

**Low contrast does not mean `--muted`.** Measured, `--muted` on `--bg` is **1.89:1**, which
fails WCAG at every size. It cannot carry text. De-emphasis in the reading register uses
`--ink-soft` instead (5.55:1 on `--bg`, 6.93:1 on `--surface`), which is a tonal step of
`--ink`, not a sixth colour. See section 3.

**Rule:** if a user has to read it to make a decision about a job, it is set in the reading
face. No exceptions.

---

## 3. Palette

Five tokens. There is no sixth. There is no accent colour in the chromatic sense, and adding
one is a breaking change to the design, not a tweak.

```
--bg        #c2c2c0   Background. Carries most of the visible area.
--surface   #d8d8d6   Small deliberate moments only. Cards, the CTA capsule, raised rows.
--ink       #0d0d0d   Primary type, tile glyphs. Substantial secondary share. 10.89:1 on bg.
--muted     #8c8c8a   NON-TEXT ONLY. Hairlines, unreached cells, grid field, stipple face.
--accent    #111111   Small deliberate moments only. Pressed states, the sent-marker.
```

Plus one derived tone, which is a tonal step of `--ink` and not a sixth colour:

```
--ink-soft  #434343   De-emphasised reading-register text. 5.55:1 on bg, 6.93:1 on surface.
```

**`--muted` is never used for text in the reading register.** It measures 1.89:1 against
`--bg`, so it fails WCAG at every size, and section 10 outranks aesthetics. It keeps its
substantial share of the visible area through hairline borders, unreached stage cells, the
ambient grid field, and the stipple display face, where the brief's legibility trade is
explicitly accepted and the same information is always available elsewhere in the reading
face.

Distribution matters as much as the hex values. `--bg` is most of the screen. `--surface` and
`--accent` are punctuation. If a screen is mostly `--surface`, it is wrong.

### Semantic status colour

Stage and outcome do **not** get a rainbow. They are encoded by:

1. Position in the tile-grid stage strip (a filled cell means the stage was reached)
2. Fill weight: `--ink` for reached, `--muted` for not reached, hollow for skipped
3. A short reading-face label

`outcome = rejected | ghosted | withdrawn` renders the strip in `--muted` and strikes the
final reached cell. `outcome = offer | accepted` renders the strip in `--ink` with the final
cell doubled in weight. No red, no green. The grid carries the meaning.

**Stale** is the one place a non-grey signal is permitted, and it is still not chromatic: a
stale row gets a hairline `--ink` left rule and its silence counter renders in `--ink`
instead of `--muted`. Urgency is expressed as contrast, not hue.

---

## 4. Type

### Display and sub-display: the tile renderer

Both are produced by `src/lib/tile-font.ts` plus `src/components/type/TileText.tsx`.

- Glyphs are defined on a **5 wide x 8 tall** cell grid. Ascenders occupy rows 0-6,
  x-height rows 2-6, descenders rows 2-7.
- **Lowercase only** for display. Counters are formed by omitted squares.
- Tight fitting: one empty column between glyphs, never more.
- **Solid mode**: each on-cell is one filled square, `--ink`, with a faint seam line where
  cells abut. Seams are a `--muted` hairline at low opacity, visible on inspection, not
  obvious at a glance.
- **Stipple mode**: each on-cell is rendered as a cluster of much smaller squares rather than
  one solid square, giving the dot-matrix stroke. Fill is `--muted`.
- Rendered as SVG `<rect>` elements so the geometry stays crisp at every size and individual
  cells remain animatable.

### Reading face

System monospace stack. Wide even tracking (`0.06em` at body size), generous leading
(`1.75`), mixed case, one weight throughout.

### Scale

A dramatic range carried by **one weight**. There is no bold. Emphasis is achieved by size,
by tile-vs-reading register, and by `--ink` against `--muted`. If you reach for a heavier
weight, you have misunderstood the system.

```
display-xl   hero wordmark, fluid, spans most of viewport width
display-l    page titles
display-m    section headers
sub          stipple subheads and kickers
body         table cells, form values, prose
micro        column headers, timestamps, unit labels
```

---

## 5. Composition

- **Implied square grid.** All spacing, all sizing, all component dimensions resolve to
  multiples of the base cell. The grid is the same grid the glyphs are drawn on. This is the
  argument of the design, so it is enforced by spacing tokens, not by eyeballing.
- **Content runs edge to edge.** Full bleed. No centred max-width container on the hero.
- **Asymmetric clustering.** Rest is pushed into a few big gaps rather than spread evenly.
  The hero puts very large empty margins above and below the wordmark, then packs the subhead
  and CTA tight against each other as one right-hand cluster.
- Header is **sticky**.

### Hero (marketing route `/`)

Full-bleed, on the implied square grid. Oversized tile wordmark set high, spanning most of the
width. Right-aligned two-line stipple subhead and the CTA capsule stacked tight to the right
rail. Centred scroll cue at the base, pulsing on a 0.9s loop. No imagery anywhere on the site.

### App shell (routes under `/applications`, `/companies`)

Inherits palette, grid, surfaces, and motion rules. Departs from the hero in exactly one way:
information density. The table view is dense on purpose and uses the reading face throughout.
The tile renderer appears in the app only as the wordmark in the sticky header, page titles,
the stage strip, and empty states.

---

## 6. Space

Airy overall, unevenly distributed. Base cell drives everything.

```
--cell   8px      the unit
--s-1    8px      tight pairs (label to value)
--s-2    16px     within a cluster
--s-3    32px     between clusters
--s-5    80px     between sections
--s-8    200px    hero breathing room above and below the wordmark
```

Adjacent elements that belong together sit at `--s-1` or `--s-2` with nothing between them.
Unrelated groups get `--s-5` or more. Nothing sits at a middling distance. Middling distance
is what makes a layout read as unconsidered.

---

## 7. Surfaces

- **Clearly rounded corners.** `--r-sm 6px`, `--r-md 12px`, `--r-pill 999px`.
- **Hairline borders.** 1px, `--muted`, often at partial opacity.
- **Pronounced elevation, hard offset shadow.** Not a soft blur. `4px 4px 0 var(--ink)` for
  the CTA at rest, collapsing toward `2px 2px 0` on press. This is the single material moment
  in the system.
- Fills are **matte and flat**. No gradients. No glass. No glow. Ever.
- Tile glyphs carry faint seam lines where cells abut.

Exactly one lifted, shadowed capsule per screen region. If you need a second action, it is a
flat text button in the reading face, not a second capsule.

---

## 8. Imagery

None. There is no illustration, no photography, no decorative iconography.

Icons are permitted only where a control would be ambiguous without one, and they are drawn on
the same 5x8 cell grid as the glyphs, in `--ink` or `--muted`, single weight. An icon that
does not resolve to the cell grid does not ship.

The exception, and it is a real one: **user-pasted job screenshots** are imagery, and they
appear in the ingestion review screen and the application detail panel. They are presented as
evidence inside a hairline-bordered, rounded, matte frame, never bled, never decorative.

---

## 9. Motion

Motion is pervasive. Almost everything responds. Triggers: scroll, hover, page load, and
ambient (running with no trigger at all). Mixed timing functions at a brisk pace.

```
--t-state    0.15s ease            background, colour, border, shadow
--t-enter    0.72s ease-out        opacity and non-transform entrance properties
--e-spring   cubic-bezier(0.34, 1.56, 0.64, 1)   transform on entrance, with overshoot
--t-pulse    0.9s                  scroll cue loop
```

- **State changes** (hover, focus, press) are 0.15s eases on background, colour and shadow.
- **Entrances** run 0.72s ease-out, with transform on the spring curve so they land with a
  slight overshoot.
- **Reveals land at several distinct depths, not as one batch.** Elements in a section are
  staggered so foreground arrives before background, or the reverse. A section where
  everything fades in simultaneously is a bug.
- **Scroll-linked parallax is the default, not the exception.** On the marketing page,
  elements move at rates other than the scroll rate. Over a long page this should read as
  hundreds of independently-rated elements, which is what makes the stillness of the hero
  land when you arrive back at the top.
- Header is sticky and reacts to scroll position.

### Reduced motion

Under `prefers-reduced-motion: reduce` the page declares **materially less** motion. This is
not a token tweak, it is a different experience:

- All parallax and scroll-rate divergence: **off**. Elements sit at scroll rate.
- Entrance transforms: **off**. Opacity-only reveals, and much shorter.
- Ambient loops including the scroll cue pulse: **off**.
- State changes on hover and focus: **kept**, because they are feedback, not decoration.

This is what puts the choreography on the craft side rather than the spectacle side. It is
tested, not assumed.

---

## 10. Accessibility floor

Non-negotiable, and it outranks everything above except where explicitly noted.

- Body copy meets **WCAG AA** contrast on `--bg`. The stipple sub-display face is the one
  permitted exception, and only where the same information is available elsewhere on screen
  in the reading face.
- Every interactive element has a visible focus state built from the same hairline plus hard
  offset shadow vocabulary. Focus is never removed.
- Tile-rendered text has an accessible text equivalent. SVG glyph output is
  `aria-hidden`, with the real string exposed to assistive technology.
- Stage and outcome are never communicated by fill weight alone. The reading-face label is
  always present.
- Targets are at least 44px on their smallest axis, resolved to the cell grid.

---

## 11. Anti-patterns

These are rejected on sight, no discussion:

- Any chromatic colour, including status red or green
- Gradients, soft blurred shadows, glassmorphism, glow
- A second font weight used for emphasis
- Stock icon sets, illustrations, or decorative imagery
- Centred max-width containers on full-bleed surfaces
- Evenly distributed whitespace
- More than one lifted capsule competing in a region
- Stipple or tile faces used for text a user must read to make a decision
- A section where every element reveals on the same beat
- Motion that survives `prefers-reduced-motion`
