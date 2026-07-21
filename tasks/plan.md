# Implementation Plan: Heart Postage Favicon

## Overview

Implement the approved Heart Postage favicon as one dependency-free SVG in Vite's public directory, expose it through a single HTML metadata declaration, and protect root and GitHub Pages base-path behavior with browser tests. Preserve the existing untracked `work/` directory.

Approved design: `docs/superpowers/specs/2026-07-21-heart-postage-favicon-design.md`

## Architecture decisions

- Use `public/favicon.svg` so the source has a stable public filename and is copied into the production output unchanged.
- Reference it once from processed `index.html` as `/favicon.svg`; Vite rewrites the HTML asset URL for the configured production `base`.
- Keep the SVG self-contained: flattened path geometry, three approved colors, transparency, and no font, emoji, mask, filter, CSS variable, script, or external resource.
- Add local and deployed Playwright coverage because the important behavior is browser metadata plus an HTTP asset request, not application runtime logic.
- Keep the change sequential. The tests define the URL/content contract that the asset and HTML declaration must satisfy.

## Dependency graph

```text
Task 0: Verify baseline
  -> Task 1: Add failing favicon browser contract
    -> Task 2: Add SVG and HTML integration
      -> Task 3: Run release and visual verification
```

## Task 0: Verify the baseline

**Description:** Confirm implementation begins from the approved design commit with a green repository and no unrelated tracked changes.

**Acceptance criteria:**

- [ ] `b69756b` is present in branch history.
- [ ] Existing tests and the production build pass before favicon changes.
- [ ] `work/` remains the only known unrelated untracked path and is untouched.

**Verification:**

- [ ] Run `npm run check`.
- [ ] Run `git status --short` and confirm no tracked change is present.

**Dependencies:** None.

**Files likely touched:** None; verification only.

**Estimated scope:** XS.

## Task 1: Add the failing favicon browser contract

**Description:** Extend local and deployed smoke coverage to require exactly one SVG favicon whose resolved URL stays inside the active site base and returns a successful SVG response.

**Acceptance criteria:**

- [ ] The local smoke test requires one `link[rel="icon"][type="image/svg+xml"]` element and verifies its HTTP response.
- [ ] The deployed smoke test requires the favicon pathname to start with the deployed Pages base and verifies status and `image/svg+xml` content type.
- [ ] The focused local test fails before the favicon declaration exists.

**Verification:**

- [ ] Run `npx playwright test tests/e2e/smoke.spec.ts --project=desktop-chromium -g "favicon"` and confirm RED for the missing metadata.
- [ ] Type-check the modified tests with `npm run typecheck`.

**Dependencies:** Task 0.

**Files likely touched:**

- `tests/e2e/smoke.spec.ts`
- `tests/e2e/live-smoke.spec.ts`

**Estimated scope:** S.

## Task 2: Add the approved SVG and HTML integration

**Description:** Create the flattened Heart Postage SVG from the approved geometry and add one base-safe favicon declaration to the HTML entry point.

**Acceptance criteria:**

- [ ] `public/favicon.svg` uses a `64 × 64` view box, approved geometry, `#D9A0A8`, `#AE3550`, `#FFFAF2`, and transparency only.
- [ ] The SVG contains a `<title>` but no text glyph, emoji, mask, filter, CSS variable, script, or external reference.
- [ ] `index.html` contains exactly one SVG favicon declaration with `href="/favicon.svg"`.
- [ ] Focused local favicon coverage passes.

**Verification:**

- [ ] Run `npx playwright test tests/e2e/smoke.spec.ts --project=desktop-chromium -g "favicon"` and confirm GREEN.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build` and confirm `dist/favicon.svg` exists.

**Dependencies:** Task 1.

**Files likely touched:**

- `public/favicon.svg`
- `index.html`

**Estimated scope:** S.

## Checkpoint: Functional favicon

- [ ] The focused test changed from RED to GREEN for the intended reason.
- [ ] The favicon response is successful at the local root base.
- [ ] The production build contains the source SVG.

## Task 3: Run base-path, visual, and release verification

**Description:** Prove the built HTML points to the favicon under a simulated repository base, inspect the real browser-tab result at small sizes, and run the complete release gate.

**Acceptance criteria:**

- [ ] A GitHub Pages-style build emits a favicon URL under `/jamie-date-invitation/` and includes `dist/favicon.svg`.
- [ ] The heart and postage silhouette remain recognizable at 16 and 32 pixels on light and dark browser chrome.
- [ ] All existing unit, browser, type, and production-build checks pass.
- [ ] No unrelated file is staged or changed.

**Verification:**

- [ ] In PowerShell, set `GITHUB_ACTIONS=true` and `GITHUB_REPOSITORY=owner/jamie-date-invitation`, run `npm run build`, inspect `dist/index.html`, then remove only those two temporary environment variables.
- [ ] Open the site in a real browser, hard refresh once, and inspect the tab icon plus direct `/favicon.svg` rendering at 16, 32, and 128 pixels.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check` and `git status --short`.

**Dependencies:** Task 2.

**Files likely touched:** None unless verification reveals a defect.

**Estimated scope:** XS.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Perforations blur at 16 pixels | Medium | Use four broad notches per edge and keep recognition dependent on the solid heart and stamp field. |
| SVG masks render inconsistently as a favicon | Medium | Flatten the postage silhouette into native even-odd path geometry. |
| GitHub Pages base produces a root-relative 404 | High | Assert the deployed base in Playwright and inspect a simulated repository-base build. |
| Browser favicon cache hides the new result | Low | Hard refresh once during manual visual verification; no cache-busting asset name is needed for the first favicon. |

## Open questions

None. The visual direction, asset scope, colors, geometry, and base-path behavior are approved.

## Plan verification

- [x] Every task has acceptance criteria.
- [x] Every task has explicit verification.
- [x] Dependencies are identified and ordered.
- [x] No task touches more than four files.
- [x] A checkpoint separates implementation from final verification.
- [ ] Human approval is required before implementation begins.
