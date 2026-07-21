# Heart Postage Favicon — Design Specification

Date: 2026-07-21

Status: Approved in collaborative visual review

## 1. Summary

Add one SVG favicon that matches the invitation's handmade love-letter design language. The approved direction is **Heart Postage**: a faded-rose postage stamp with a cream inset frame and one burgundy heart.

The design prioritizes recognition at 16 CSS pixels. It uses only bold shapes and existing color tokens, with no text, fonts, gradients, shadows, or photographic assets.

## 2. Goals

- Make the site recognizable in a browser tab at 16 and 32 pixels.
- Reuse the existing postal, scrapbook, and heart motifs.
- Remain legible on both light and dark browser chrome.
- Produce a deterministic, lightweight vector asset with no external dependencies.
- Resolve correctly under the repository-specific GitHub Pages base path.

## 3. Non-goals

- No logo redesign or new brand system.
- No alternate themes, animation, text, initials, or recipient-specific variants.
- No web app manifest, PWA icon set, Apple touch icon, or generated raster pack in this change.
- No AI-generated bitmap artwork; the icon is native SVG geometry.

## 4. Approved visual design

### 4.1 Composition

Use a square `64 × 64` SVG view box with transparent space outside the stamp.

The icon has three visible layers:

1. **Stamp silhouette** — a `54 × 54` faded-rose field at `(5, 5)` with a `5`-unit corner radius. Four `2.4`-unit semicircular notches on each side suggest postage perforations. Their centers sit at `14`, `26`, `38`, and `50` along each edge. At 16 pixels these resolve as a gently handmade edge rather than individual fine holes.
2. **Inset frame** — one cream `38 × 38` rounded-rectangle stroke at `(13, 13)`, with a `4`-unit corner radius, `2`-unit stroke, and `0.78` opacity. It is decorative and may soften at 16 pixels, but it must not be required to recognize the icon.
3. **Heart** — one centered, solid burgundy heart with an approximate visible bounding box of `x=20–44` and `y=21–47`. It is the primary recognition shape.

No element may depend on a stroke thinner than the inset frame. The outer stamp silhouette and heart remain solid fills.

### 4.2 Palette

- Stamp field: faded rose `#D9A0A8`
- Heart: letterpress burgundy `#AE3550`
- Inset frame: cream paper `#FFFAF2`
- Transparent outside area

These values come directly from `src/styles/tokens.css`. Do not introduce new favicon-only colors.

### 4.3 Geometry and rendering constraints

- Keep all important artwork inside the `54 × 54` stamp field centered in the view box.
- Use four large notches per edge, not a dense dotted border.
- Center the heart optically as well as mathematically; its bottom point may extend slightly below the stamp's vertical midpoint.
- Flatten the stamp edge into native SVG path geometry. Do not depend on fonts, emoji, external references, CSS variables, filters, or runtime JavaScript.
- Do not include the preview-only drop shadow in the final asset.
- Include an accessible `<title>` in the standalone SVG source, while the HTML favicon link itself remains non-interactive page metadata.

## 5. Asset and integration design

Create `public/favicon.svg` as the single source asset. Add this declaration to `index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Vite processes asset references in the HTML entry point and rewrites them for the configured `base` during production builds. The existing `vite.config.ts` remains the source of truth for root and repository-specific GitHub Pages paths. The existing theme color `#F5E7D7` remains unchanged.

The favicon must not be written directly into `dist/`, because `dist/` is generated and ignored.

## 6. Validation

Validate the completed asset at all of these sizes and contexts:

- 128 pixels for geometry inspection
- 32 pixels on a light background
- 16 pixels on light and dark backgrounds
- A real browser tab in development
- The production build with a simulated repository base path

At 16 pixels, the pass condition is a clearly visible burgundy heart inside a pink postage-like square. Loss of the cream inset frame is acceptable; loss of the heart or outer silhouette is not.

## 7. Acceptance criteria

1. The favicon matches the approved Heart Postage sample.
2. The heart and stamp silhouette remain recognizable at 16 pixels.
3. The asset uses only `#D9A0A8`, `#AE3550`, `#FFFAF2`, and transparency.
4. The SVG contains no text glyphs, emoji, filters, external assets, or scripts.
5. Development and production pages expose exactly one SVG favicon declaration.
6. The built favicon URL respects both root deployment and the configured GitHub Pages repository base.
7. Existing tests and the production build continue to pass.
