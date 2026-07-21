# Short Invitation URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task by task. Keep the pre-existing untracked `work/` directory untouched.

**Goal:** Make the invitation maker emit self-contained `<site-base>/s/#<payload>` links that remain fully static, preserve legacy query URLs, fail safely when corrupt, and stay at or below 140 characters for the approved reference fixture.

**Architecture:** Add a pure compact-schema layer, a versioned raw-DEFLATE/Base64URL codec, and a base-aware short-URL facade. Serve `/s/` through a real second Vite HTML entry with MPA fallback behavior, route it before query/maker handling, and keep the existing parser as the final sanitation boundary. Maker states that are not shareable retain the existing long URL only as an internal iframe preview; ready-to-send output, preview, copy, and Web Share all use the same short URL.

**Tech stack:** TypeScript 7, Vite 8.1, Vitest 4, Playwright 1.61, `fflate` 0.8.3, GitHub Pages.

**Approved design:** `docs/superpowers/specs/2026-07-21-short-invitation-url-design.md`

---

## Dependency graph

```text
Task 0: green baseline
  ├─> Task 1: shared defaults + compact schema
  │     -> Task 2: binary codec + exact dependency
  │       -> Task 3: short URL facade ─┐
  └─> Task 4: real Vite /s/ entry ─────┴─> Task 5: bootstrap + invalid-link UI
                                            -> Task 6: maker + sharing integration
                                              -> Task 7: production/deployed verification
                                                -> Task 8: documentation + release gate
```

Tasks 1–3 define the shared wire contract and should remain sequential. Task 4 touches independent build files and may be prepared in parallel after the design is frozen, but it must land before Task 5. Tasks 5–8 are integration-dependent and should remain sequential.

## File map

- `src/domain/invitation-config.ts` — shared fallback constants and derivation helpers used by both parser and schema.
- `src/domain/invitation-config.test.ts` — proves extracting defaults does not change the legacy query contract.
- `src/short-url/payload-schema.ts` — shareable type, sparse bitmask tuple, field validation, and parser re-entry.
- `src/short-url/payload-schema.test.ts` — canonical tuple, round-trip, omission, and malformed-schema coverage.
- `src/short-url/payload-codec.ts` — version byte, UTF-8, raw DEFLATE, strict Base64URL, and size limits.
- `src/short-url/payload-codec.test.ts` — codec, interop, corruption, UTF-8, and limit coverage.
- `src/short-url/short-url.ts` — base-aware `/s/` recognition, public URL construction, and hash decoding.
- `src/short-url/short-url.test.ts` — root/project-base routing and URL-length coverage.
- `s/index.html` — real static short-link HTML entry.
- `vite.config.ts` — Vite 8 MPA mode and explicit root/short HTML inputs.
- `src/main.ts` — short-route-first bootstrap.
- `src/ui/invalid-invitation-view.ts` — recipient-facing malformed-link state.
- `src/maker/maker-url.ts` — validated maker output state with internal preview and public short URL.
- `src/maker/maker-url.test.ts` — maker validation, semantic decode, and invalid-state behavior.
- `src/ui/maker-view.ts` — binds maker output/preview/copy/share to the validated URL state.
- `tests/e2e/maker.spec.ts` — browser proof of opaque output, preview, copy, and Web Share.
- `tests/e2e/short-url.spec.ts` — direct short navigation, invalid states, legacy compatibility, and Telegram reuse.
- `playwright.preview.config.ts` — browser verification against built output rather than Vite dev fallback.
- `tests/production/short-url.spec.ts` — real `dist/s/index.html`, MPA 404, HTTP 200, content-type, and asset checks.
- `tests/e2e/live-smoke.spec.ts` — deployed legacy and short-route checks.
- `.github/workflows/pages.yml` — runs production preview verification before upload.
- `vitest.config.ts` — includes the new short URL modules in coverage scope.
- `README.md` — documents both URL contracts and the opaque-not-encrypted privacy model.

## Task 0: Re-establish the green baseline

**Description:** Verify the implementation starts from the approved design commit with the current lockfile and no unrelated tracked changes.

**Files:**

- Verify: `package.json`
- Verify: `package-lock.json`
- Preserve: `work/`

- [ ] **Step 1: Install the current locked dependencies**

Run:

```powershell
npm ci
```

Expected: dependencies install without changing either package manifest.

- [ ] **Step 2: Run the existing release gate**

Run:

```powershell
npm run check
git status --short
```

Expected: the existing suite passes. `work/` may remain as the known untracked user directory; no tracked implementation file is modified. Stop and diagnose any unrelated baseline failure before continuing.

**Acceptance criteria:**

- [ ] Existing unit, browser, typecheck, and build checks are green.
- [ ] No user-owned or unrelated file is changed.

**Dependencies:** None.

**Estimated scope:** XS, verification only.

## Task 1: Define the canonical sparse invitation schema

**Description:** Extract parser-owned defaults and derivation helpers, then implement the typed `ShareableInvitationConfig` and exact 12-bit tuple contract without compression concerns.

**Files:**

- Modify: `src/domain/invitation-config.ts`
- Modify: `src/domain/invitation-config.test.ts`
- Create: `src/short-url/payload-schema.ts`
- Create: `src/short-url/payload-schema.test.ts`

- [ ] **Step 1: Write failing domain and schema tests**

Add expectations for exported parser-owned values and helpers:

```ts
DEFAULT_TO === "Jamie"
DEFAULT_TIME_ZONE === "Asia/Singapore"
DEFAULT_DURATION === 120
deriveInvitationTitle("Alex") === "Date with Alex 💌"
deriveNotifyName("Alex") === "Alex"
```

In the schema tests, require these public APIs:

```ts
export type ShareableInvitationConfig =
  Omit<InvitationConfig, "date" | "time" | "make"> & {
    readonly date: string;
    readonly time: string;
    readonly make: false;
  };

export type CompactInvitationTuple =
  readonly [mask: number, ...values: readonly (string | number)[]];

export function isShareableInvitationConfig(
  config: InvitationConfig,
): config is ShareableInvitationConfig;

export function invitationConfigToTuple(
  config: ShareableInvitationConfig,
): CompactInvitationTuple;

export function tupleToInvitationConfig(
  value: unknown,
): ShareableInvitationConfig;
```

Cover the approved fixture exactly:

```json
[590,"Alex",20260808,1170,"Botanic Gardens","alex_date"]
```

Also cover all explicit fields, default/derived omissions, empty optionals, Unicode and emoji, maximum-length text, unknown mask bits, incorrect value counts/types, invalid ranges, and missing date/time bits.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
npm test -- src/domain/invitation-config.test.ts src/short-url/payload-schema.test.ts
```

Expected: tests fail because the helpers and schema module do not exist.

- [ ] **Step 3: Extract shared parser defaults without changing behavior**

Export `DEFAULT_TO`, `DEFAULT_TIME_ZONE`, `DEFAULT_DURATION`, `deriveInvitationTitle(from)`, and `deriveNotifyName(from)`. Replace the parser's duplicated literals with those exports. Keep `DEFAULT_NOTE` as the existing parser-owned export.

- [ ] **Step 4: Implement strict tuple packing and unpacking**

Use:

```ts
const KNOWN_MASK = 0x0fff;
const REQUIRED_MASK = 0x000c;
```

Packing omits only values equal to the parser's defaults or derivations. Unpacking treats `JSON.parse` output as `unknown`, validates an integer mask and exact `1 + popcount(mask)` tuple length, consumes values in bit order with an explicit cursor, reconstructs `URLSearchParams`, calls `parseInvitationConfig`, and narrows the result with `isShareableInvitationConfig`.

Date is decimal `YYYYMMDD`, left-padded to eight digits on decode. Time is integer minutes `0..1439`. Numeric values must be finite integers inside their field ranges. Do not use broad tuple casts to bypass `noUncheckedIndexedAccess`.

- [ ] **Step 5: Verify GREEN and legacy compatibility**

```powershell
npm test -- src/domain/invitation-config.test.ts src/short-url/payload-schema.test.ts
npm run typecheck
```

Expected: the canonical tuple and all malformed inputs behave as specified, and the legacy parser tests remain unchanged and green.

- [ ] **Step 6: Commit the schema increment**

```powershell
git add src/domain/invitation-config.ts src/domain/invitation-config.test.ts src/short-url/payload-schema.ts src/short-url/payload-schema.test.ts
git commit -m "feat: define compact invitation payload schema"
```

**Acceptance criteria:**

- [ ] The approved fixture produces mask `590` and the exact canonical tuple.
- [ ] Every shareable field round-trips through the production parser.
- [ ] Invalid tuple shapes, values, and incomplete invitations fail closed.

**Dependencies:** Task 0.

**Estimated scope:** M, four files.

## Task 2: Add the versioned compressed payload codec

**Description:** Pin `fflate`, implement the version 1 binary envelope and strict Base64URL codec, and independently verify raw-DEFLATE interoperability.

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Create: `src/short-url/payload-codec.ts`
- Create: `src/short-url/payload-codec.test.ts`

- [ ] **Step 1: Pin the exact runtime dependency**

```powershell
npm install --save-exact fflate@0.8.3
npm ls fflate --depth=0
```

Expected: both manifests record exactly `0.8.3`, and npm reports one top-level installation.

- [ ] **Step 2: Write failing codec tests**

Require:

```ts
export const MAX_ENCODED_PAYLOAD_LENGTH = 8_192;
export const MAX_INFLATED_PAYLOAD_BYTES = 8_192;

export function encodeInvitationPayload(
  config: ShareableInvitationConfig,
): string;

export function decodeInvitationPayload(
  token: string,
): ShareableInvitationConfig;
```

Test semantic round-trip, deterministic output, `^[A-Za-z0-9_-]+$`, no `=` padding, encoder-side limits, empty input, invalid alphabet and Base64 length, noncanonical tail bits, missing/unknown version, truncated/corrupt DEFLATE, fatal UTF-8, invalid JSON/schema, the 8,192/8,193 inflated-byte boundary, and the `payload.length <= 87` reference gate.

Use `node:zlib` as an independent test oracle: `inflateRawSync` must read the production encoder's DEFLATE bytes, and the production decoder must accept a version 1 envelope built with `deflateRawSync`. Do not snapshot a complete compressed token.

- [ ] **Step 3: Run the focused codec test and confirm RED**

```powershell
npm test -- src/short-url/payload-codec.test.ts
```

Expected: the missing codec API fails the new tests.

- [ ] **Step 4: Implement the strict version 1 envelope**

Use named imports only:

```ts
import { deflateSync, inflateSync } from "fflate";
```

Encoding order:

1. Tuple to JSON.
2. `TextEncoder` to UTF-8 and reject output over 8,192 bytes.
3. `deflateSync(bytes, { level: 9 })`.
4. Prefix byte `0x01`.
5. Base64 encode, replace `+`/`/`, and remove padding.
6. Reject a generated token over 8,192 characters.

Decoding order:

1. Nonempty, length `<= 8_192`, strict alphabet, and `length % 4 !== 1`.
2. Restore padding, decode bytes, re-encode bytes, and compare with the input to reject noncanonical tail bits.
3. Require envelope byte `0x01` and nonempty compressed bytes.
4. `inflateSync` into `new Uint8Array(8_193)`; reject a returned length of `8_193`.
5. `new TextDecoder("utf-8", { fatal: true })`.
6. `JSON.parse` into `unknown`, then delegate to `tupleToInvitationConfig`.

The output buffer bounds allocation. The encoded-input cap limits residual CPU expansion risk; do not claim constant-time decompression or rejection of bytes appended after a valid final DEFLATE block.

- [ ] **Step 5: Add the new module to coverage scope and verify GREEN**

Add `src/short-url/**/*.ts` to `vitest.config.ts` coverage includes, then run:

```powershell
npm test -- src/short-url/payload-schema.test.ts src/short-url/payload-codec.test.ts
npm run typecheck
npm ls fflate --depth=0
```

- [ ] **Step 6: Commit the codec increment**

```powershell
git add package.json package-lock.json vitest.config.ts src/short-url/payload-codec.ts src/short-url/payload-codec.test.ts
git commit -m "feat: encode compact invitation payloads"
```

**Acceptance criteria:**

- [ ] Version 1 round-trips through both `fflate` and the independent Node zlib oracle.
- [ ] Malformed, oversized, unknown-version, and invalid-UTF-8 inputs fail closed.
- [ ] The reference token is no longer than 87 characters.

**Dependencies:** Task 1.

**Estimated scope:** M, five files.

## Checkpoint A: Wire contract

- [ ] `npm test -- src/domain/invitation-config.test.ts src/short-url/payload-schema.test.ts src/short-url/payload-codec.test.ts`
- [ ] `npm run typecheck`
- [ ] Review the tuple and envelope as immutable version 1 compatibility contracts before browser integration.

## Task 3: Build the base-aware short URL facade

**Description:** Compose the codec into pure URL construction and route-recognition functions that work at both `/` and GitHub Pages repository bases.

**Files:**

- Create: `src/short-url/short-url.ts`
- Create: `src/short-url/short-url.test.ts`

- [ ] **Step 1: Write failing facade tests**

Define and test:

```ts
export function isShortInvitationPath(
  pathname: string,
  basePath?: string,
): boolean;

export function buildShortInvitationUrl(
  currentHref: string,
  config: ShareableInvitationConfig,
  basePath?: string,
): URL;

export function decodeShortInvitationHash(
  hash: string,
): ShareableInvitationConfig;
```

Cover root base, `/jamie-date-invitation/`, a renamed repository base, exact `/s/` matching, near-miss paths, query independence, required fragment, and decoded semantic equality. For the production fixture require pathname `/jamie-date-invitation/s/`, empty search, an opaque hash, total URL length `<= 140`, and a URL shorter than `buildMakerUrl`'s legacy equivalent.

- [ ] **Step 2: Confirm RED**

```powershell
npm test -- src/short-url/short-url.test.ts
```

- [ ] **Step 3: Implement base-safe URL behavior**

Build with standard URL resolution:

```ts
const siteBase = new URL(basePath, currentHref);
const url = new URL("s/", siteBase);
url.hash = encodeInvitationPayload(config);
```

Default `basePath` to `import.meta.env.BASE_URL`, but allow explicit values in tests. Path recognition must compare the normalized configured base plus `s/`; it must not infer the repository name from `location.pathname` or preserve the maker query.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- src/short-url/short-url.test.ts
npm run typecheck
git add src/short-url/short-url.ts src/short-url/short-url.test.ts
git commit -m "feat: build static short invitation URLs"
```

**Acceptance criteria:**

- [ ] Root, repository, and renamed bases resolve to their own real `/s/` path.
- [ ] Short URLs contain no query or visible invitation values.
- [ ] The production reference URL satisfies the 140-character contract.

**Dependencies:** Task 2.

**Estimated scope:** S, two files.

## Task 4: Emit a real Vite `/s/` page

**Description:** Turn the project into an explicit two-entry MPA so `/s/` is a physical static page and missing paths cannot pass tests through Vite's default SPA fallback.

**Files:**

- Create: `s/index.html`
- Modify: `vite.config.ts`

- [ ] **Step 1: Prove the short artifact is currently absent**

```powershell
npm run build
Test-Path dist\s\index.html
```

Expected before implementation: `False`.

- [ ] **Step 2: Add the short HTML entry**

Create `s/index.html` with the same metadata, `#app` mount point, and `/src/main.ts` module entry as root `index.html`.

- [ ] **Step 3: Configure Vite 8's current MPA API**

Use the documented Vite 8 properties:

```ts
import { resolve } from "node:path";

export default defineConfig({
  appType: "mpa",
  base: githubPagesBase(...),
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        short: resolve(import.meta.dirname, "s/index.html"),
      },
    },
  },
});
```

Do not use the deprecated `build.rollupOptions` spelling.

- [ ] **Step 4: Verify both artifacts and shared asset paths**

```powershell
npm run build
Test-Path dist\index.html
Test-Path dist\s\index.html
Select-String -Path dist\s\index.html -Pattern "assets/"
```

Expected: both files exist and the short entry references built assets under the configured base.

- [ ] **Step 5: Commit the MPA entry**

```powershell
git add s/index.html vite.config.ts
git commit -m "build: emit static short invitation entry"
```

**Acceptance criteria:**

- [ ] `dist/s/index.html` is a real build artifact.
- [ ] Vite is in MPA mode, eliminating the default SPA fallback.
- [ ] Root and short entries load the same application bundle under the configured base.

**Dependencies:** Task 0; must land before Task 5.

**Estimated scope:** S, two files.

## Task 5: Decode short routes and render invalid links safely

**Description:** Route `/s/` before maker/query handling, mount normal invitations from valid payloads, and provide a dedicated accessible error view for every decode failure.

**Files:**

- Modify: `src/main.ts`
- Create: `src/ui/invalid-invitation-view.ts`
- Create: `tests/e2e/short-url.spec.ts`

- [ ] **Step 1: Write failing short-route browser tests**

Use the production encoder in test setup rather than a token snapshot. Cover:

- A valid `/s/#<payload>` renders exact recipient, note, schedule, place, and signature.
- `/s/?make=1#<payload>` remains invitation mode because short routing wins and query is ignored.
- `/s/`, invalid alphabet, corrupt payload, and unknown version render the exact invalid-link heading/guidance with no page error, maker form, YES/NO actions, or payload echo.
- A legacy root query still renders unchanged.

Run and confirm RED:

```powershell
npx playwright test tests/e2e/short-url.spec.ts --project=desktop-chromium
```

- [ ] **Step 2: Implement the invalid invitation view**

Render existing `desk`/`letter` visual primitives with one clear document heading and:

```text
This invitation link couldn't be opened.
Please ask the sender for a new link.
```

Set a clear document title. Do not render technical details, the payload, maker navigation, consent controls, or external links.

- [ ] **Step 3: Route short mode before parsing search**

In `main.ts`:

1. Install motion preferences and find `#app` as today.
2. If `isShortInvitationPath(location.pathname)` is true, call `decodeShortInvitationHash(location.hash)` inside one fail-closed `try/catch`.
3. On success, mount and wire the normal invitation.
4. On any error, mount only the invalid view.
5. Otherwise preserve the current root `parseInvitationConfig(location.search)` and maker/invitation branch byte for byte.

- [ ] **Step 4: Verify focused unit/browser compatibility**

```powershell
npm test -- src/short-url
npx playwright test tests/e2e/short-url.spec.ts tests/e2e/smoke.spec.ts --project=desktop-chromium
npm run typecheck
```

- [ ] **Step 5: Commit the recipient flow**

```powershell
git add src/main.ts src/ui/invalid-invitation-view.ts tests/e2e/short-url.spec.ts
git commit -m "feat: open compact invitation links"
```

**Acceptance criteria:**

- [ ] Valid short payloads render through the existing parser and invitation controller.
- [ ] Every malformed short-route input displays only the accessible error state.
- [ ] Root maker and legacy query behavior remain unchanged.

**Dependencies:** Tasks 3 and 4.

**Estimated scope:** M, three files.

## Checkpoint B: Recipient flow

- [ ] `npm test`
- [ ] `npx playwright test tests/e2e/short-url.spec.ts tests/e2e/smoke.spec.ts --project=desktop-chromium`
- [ ] `npm run build`
- [ ] Confirm `dist/s/index.html` exists before maker integration begins.

## Task 6: Make validated maker output short by default

**Description:** Preserve live preview for invalid form states, but expose and share only the validated opaque URL once the invitation is ready.

**Files:**

- Modify: `src/maker/maker-url.ts`
- Modify: `src/maker/maker-url.test.ts`
- Modify: `src/ui/maker-view.ts`
- Modify: `tests/e2e/maker.spec.ts`
- Modify: `tests/e2e/short-url.spec.ts`

- [ ] **Step 1: Write failing maker-output tests**

Introduce one pure output-state API, for example:

```ts
export interface MakerUrlState {
  readonly errors: readonly string[];
  readonly previewUrl: URL;
  readonly shareUrl: URL | null;
}

export function buildMakerUrlState(
  currentHref: string,
  basePath: string,
  values: MakerValues,
): MakerUrlState;
```

Require that valid values produce identical `previewUrl` and `shareUrl` at `/s/#<payload>`, with empty search and semantic equality after decoding. Invalid/incomplete values produce the current legacy URL only as `previewUrl`, return `shareUrl: null`, and keep validation messages. Preserve all existing duration, time-zone, DST, trimming, and parser-boundary tests.

Update browser expectations so the ready maker:

- Shows an opaque `/s/#<payload>` with no `make`, field names, or invitation copy.
- Uses the exact generated URL as iframe `src`, clipboard text, and successful `navigator.share` URL.
- Renders the exact decoded recipient data in the iframe.
- Keeps generated output empty and actions disabled while invalid, while the internal legacy preview still updates.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
npm test -- src/maker/maker-url.test.ts
npx playwright test tests/e2e/maker.spec.ts --project=desktop-chromium
```

- [ ] **Step 3: Implement validation-before-encoding**

Keep the current long `buildMakerUrl` path as the private/internal normalization and invalid-preview representation. In `buildMakerUrlState`:

1. Normalize optional maker defaults.
2. Build the internal legacy URL and validate the same normalized values.
3. If errors exist, return the legacy preview and `shareUrl: null`.
4. Parse the internal URL through `parseInvitationConfig` and narrow to `ShareableInvitationConfig`.
5. Build the public short URL with `buildShortInvitationUrl`.
6. Return that same short URL for preview and sharing.

The UI sets `generated.value` to `shareUrl?.toString() ?? ""`, points the iframe at `previewUrl`, and enables copy/share only when `shareUrl` exists. `materializeDefaults` must recompute the complete state before copying or sharing.

- [ ] **Step 4: Add Telegram short-link regression to the existing short URL E2E suite**

Obtain a short URL through maker mode, open it in a fresh page, choose YES, and inspect the generated direct Telegram link. With generated `tgText`, require the decoded Telegram draft to contain the exact short `location.href` once. Preserve the existing custom-`tgText` rule that intentionally does not append the invitation URL.

- [ ] **Step 5: Verify GREEN across maker and integrations**

```powershell
npm test -- src/maker/maker-url.test.ts src/integrations/telegram.test.ts
npx playwright test tests/e2e/maker.spec.ts tests/e2e/short-url.spec.ts --project=desktop-chromium
npm run typecheck
```

- [ ] **Step 6: Commit maker integration**

```powershell
git add src/maker/maker-url.ts src/maker/maker-url.test.ts src/ui/maker-view.ts tests/e2e/maker.spec.ts tests/e2e/short-url.spec.ts
git commit -m "feat: generate compact invitation links"
```

**Acceptance criteria:**

- [ ] Only validated maker states expose a public short URL.
- [ ] Ready preview, copy, and Web Share all receive the same short URL.
- [ ] Telegram generated drafts reuse the short URL exactly once.

**Dependencies:** Task 5.

**Estimated scope:** M, five files including the existing short-route E2E suite.

## Task 7: Prove the built and deployed `/s/` route is real

**Description:** Add a production-preview gate that cannot pass through SPA fallback, then extend deployed smoke coverage before GitHub Pages upload/release.

**Files:**

- Create: `playwright.preview.config.ts`
- Create: `tests/production/short-url.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/pages.yml`
- Modify: `tests/e2e/live-smoke.spec.ts`

- [ ] **Step 1: Write the production preview test**

The preview config uses a dedicated port, desktop Chromium, `reuseExistingServer: false`, and a base URL derived from `githubPagesBase(process.env.GITHUB_REPOSITORY, process.env.GITHUB_ACTIONS === "true")` so it works for both local root builds and Actions repository-base builds.

The production test must:

1. Assert with Node filesystem APIs that `dist/index.html` and `dist/s/index.html` both exist.
2. Request a known-missing path inside the configured base and require HTTP 404, proving `appType: "mpa"` is active.
3. Open built maker mode and dynamically generate a short URL.
4. Open that URL in a fresh browser context and require main-document HTTP 200 plus HTML content type.
5. Require exact invitation content and pathname `<base>/s/`.
6. Require scripts, styles, and bundled fonts to return 200 beneath the configured repository asset base.
7. Require no request failures or page errors.

Do not hard-code a compressed token, and do not reuse the maker page/context for the direct-navigation assertion.

- [ ] **Step 2: Add the preview command and first run**

Add:

```json
"test:e2e:preview": "playwright test --config=playwright.preview.config.ts",
"check": "npm run test && npm run test:e2e && npm run build && npm run test:e2e:preview"
```

Then run:

```powershell
npm run build
npm run test:e2e:preview
```

Expected: real built assets and `/s/` route pass; the known-missing path returns 404.

- [ ] **Step 3: Put preview verification before artifact upload**

In `.github/workflows/pages.yml`, run `npm run test:e2e:preview` after `npm run build` and before `actions/upload-pages-artifact`. Do not rebuild after preview verification.

- [ ] **Step 4: Extend deployed live smoke**

Keep the legacy query smoke. Add a separate maker-to-short flow that obtains a token dynamically, opens the short URL in a fresh context, and checks main-document 200/HTML, exact content, repository-base assets, no failed requests, and no page errors. Isolate response collections for the legacy and short cases so cached or earlier responses cannot satisfy the short assertion.

- [ ] **Step 5: Verify locally and commit**

```powershell
npm run build
npm run test:e2e:preview
npx playwright test tests/e2e/live-smoke.spec.ts --project=desktop-chromium
```

Expected: preview tests run locally; live smoke skips without `PLAYWRIGHT_BASE_URL`.

```powershell
git add playwright.preview.config.ts tests/production/short-url.spec.ts package.json .github/workflows/pages.yml tests/e2e/live-smoke.spec.ts
git commit -m "ci: verify static short invitation routes"
```

**Acceptance criteria:**

- [ ] Missing production paths return 404 while `/s/` returns a real HTML 200.
- [ ] Both local preview and deployed smoke verify repository-base assets from a fresh short-link navigation.
- [ ] CI blocks artifact upload when the short entry or its assets are missing.

**Dependencies:** Task 6.

**Estimated scope:** M, five files.

## Checkpoint C: Production path

- [ ] `npm run check`
- [ ] `Test-Path dist\s\index.html`
- [ ] Confirm the preview suite proves a missing path is 404.
- [ ] Confirm workflow order is test → browser → build → preview → upload → deploy → live smoke.

## Task 8: Document the contracts and run the release gate

**Description:** Update user-facing documentation, then run the entire project gate with explicit status and diff checks.

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update the URL and maker documentation**

Document:

- New maker output: `<site-base>/s/#<payload>`.
- Existing root query format remains supported as the legacy/manual contract.
- `/s/` without a valid payload displays recipient-facing guidance.
- Payloads are opaque compressed encodings, not encryption.
- Fragments are not sent to GitHub Pages but remain visible in history, clipboard, and shared messages.
- No backend, database, analytics, cookies, or browser storage was added.
- `npm run test:e2e:preview` verifies the actual production entry.

- [ ] **Step 2: Run focused regression checks**

```powershell
npm test -- src/domain/invitation-config.test.ts src/short-url/payload-schema.test.ts src/short-url/payload-codec.test.ts src/short-url/short-url.test.ts src/maker/maker-url.test.ts src/integrations/telegram.test.ts
npx playwright test tests/e2e/maker.spec.ts tests/e2e/short-url.spec.ts --project=desktop-chromium
```

- [ ] **Step 3: Run the complete release gate**

```powershell
npm run check
git diff --check
git status --short
```

Expected: all unit tests, desktop/mobile browser tests, type checking, production build, and production preview tests pass. Only intended tracked changes are present; `work/` remains untouched.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md
git commit -m "docs: explain compact invitation links"
```

**Acceptance criteria:**

- [ ] README accurately distinguishes short and legacy URLs and their privacy properties.
- [ ] The reference fixture remains within both the 87-character payload and 140-character full-URL limits.
- [ ] The complete local release gate passes with no unrelated changes.

**Dependencies:** Task 7.

**Estimated scope:** S, one file plus full verification.

## Final requirement coverage

| Approved requirement | Implemented and verified by |
| --- | --- |
| `/s/#<payload>` public contract | Tasks 3–6 |
| Fully static GitHub Pages deployment | Tasks 4 and 7 |
| Version byte + raw DEFLATE + Base64URL | Task 2 |
| Sparse canonical tuple and parser reuse | Task 1 |
| Legacy query compatibility | Tasks 1, 5, 6, and 8 |
| Invalid-link fail-closed UI | Task 5 |
| Maker preview/copy/share short URL | Task 6 |
| Telegram retains the short URL once | Task 6 |
| 87-character payload / 140-character full URL | Tasks 2, 3, and 8 |
| Real `dist/s/index.html` and HTTP 200 | Tasks 4 and 7 |
| Opaque-not-encrypted privacy documentation | Task 8 |

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Parser and encoder defaults drift | Old links decode differently | Export parser-owned defaults/derivations and test the exact tuple. |
| Encoder and decoder share the same defect | Self-round-trip tests pass falsely | Add bidirectional `node:zlib` interoperability tests. |
| Vite SPA fallback hides a missing short entry | CI reports a false HTTP 200 | Set `appType: "mpa"`, assert both files exist, and require a known-missing path to return 404. |
| Repository base is lost or maker query leaks | Broken Pages URL | Resolve from `import.meta.env.BASE_URL` and reset search/hash in the facade. |
| Invalid maker state enters the share codec | Corrupt/incomplete public link | Validate first; use legacy form only as an internal preview and expose no share URL. |
| Malicious compressed token consumes resources | Browser slowdown | Cap encoded input, use a sentinel output buffer, reject oversized results, and keep decode synchronous only for bounded URL-sized input. |
| Compression implementation changes length | Fixture exceeds target | Exact-pin `fflate`, assert semantic interop, and enforce separate payload/full-URL size gates. |
| Opaque payload is mistaken for secrecy | Personal data disclosure | Keep the privacy warning adjacent to both URL formats. |

## Plan completion checklist

- [ ] Every task has explicit acceptance criteria and verification commands.
- [ ] Tasks touch no more than five files each.
- [ ] Dependency order builds foundations before UI and deployment integration.
- [ ] Checkpoints follow the codec, recipient, and production milestones.
- [ ] No open design question remains; invalid maker states use internal legacy preview only.
- [ ] The user has reviewed and approved this implementation plan before code changes begin.
