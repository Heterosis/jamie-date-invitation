# Jamie Date Invitation

A static, URL-configurable romantic invitation with a celebratory YES flow, ten playful NO interactions, a respectful real refusal, Google Calendar, Telegram drafts, and a hidden link maker.

## Local use

```powershell
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:5173/?make=1` to generate and preview an invitation link. Invitation mode intentionally has no visible link back to the maker.

## URL contract

Pass invitation data as query parameters. For example:

```text
/?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&tz=Asia%2FSingapore&duration=120&place=Botanic+Gardens&telegram=alex_date&notifyName=Alex
```

Plain-text values are trimmed, control characters are removed, repeated whitespace is collapsed, and values longer than the documented maximum are truncated.

| Field | Accepted form | Missing or invalid fallback | Resulting behavior |
| --- | --- | --- | --- |
| `to` | Plain text, max 40 characters | `Jamie` | The question addresses Jamie. |
| `from` | Plain text, max 40 characters | Internal value stays empty; visible signature is `someone with butterflies` | Calendar title and notification label use their generic fallbacks. |
| `date` | Strict `YYYY-MM-DD`, real calendar date | Visible `Date to be decided` | Calendar action is disabled. |
| `time` | Strict 24-hour `HH:mm` | Visible `Time to be decided` | Calendar action is disabled. |
| `tz` | Valid IANA time-zone identifier | `Asia/Singapore` | Calendar conversion uses this deterministic default. |
| `duration` | Integer from 15 through 720 minutes | `120` | Calendar end time is two hours after its start. |
| `place` | Plain text, max 100 characters | Visible `A little surprise ✦` | The Calendar `location` parameter is omitted rather than invented. |
| `title` | Plain text, max 80 characters | `Date with {from} 💌` when `from` exists; otherwise `A very special date 💌` | Used as the Calendar event title. |
| `note` | Plain text, max 240 characters | `I've got a little plan, a lot of butterflies, and one very important question…` | Used in the letter and Calendar details. |
| `telegram` | Public username with an optional single leading `@`, followed by 1–32 letters, digits, or underscores | No direct recipient | Button becomes `SHARE ON TELEGRAM` and opens Telegram's chat picker with a draft. |
| `notifyName` | Plain text, max 40 characters | `from`, then `ME` | A direct target uses the label `TELL {notifyName} ON TELEGRAM`. |
| `tgText` | Plain text, max 500 characters | Generated acceptance message from valid invitation fields | Opens as an editable Telegram draft. |
| `make=1` | Exact mode flag | Normal invitation mode | Opens the hidden link maker. |

Selecting YES only reveals the handoff buttons; it does not open a tab or send anything. Google Calendar opens a prefilled event editor only after its own button is clicked. A valid direct Telegram target shows `TELL {notifyName} ON TELEGRAM`; a missing or invalid target shows `SHARE ON TELEGRAM`. Telegram always opens a draft and never sends automatically.

For a direct Telegram target, a generated draft includes the invitation URL, while a custom `tgText` is used exactly as written and does not append that URL. Generic sharing always places the invitation URL in Telegram's separate `url` parameter and places the generated or custom draft in the `text` parameter.

The first eight deliberate NO activations each run one non-repeating playful trick. Hover is cosmetic and never counts. While one trick is moving, extra NO activations are ignored rather than queued, and YES remains available. After trick eight settles, a genuine refusal option appears; Jamie must activate it and explicitly confirm once more before the refusal is accepted respectfully.

## NO trick catalog

The app shuffles all ten tricks without replacement, then uses the first eight for that invitation. A mouse click, touch tap, or keyboard activation (`Enter` or `Space`) counts as one deliberate NO activation; hovering never triggers a trick. Persistent position, size, and seat changes compose safely instead of snapping back after each animation, while temporary decorations clean themselves up.

| Trick | What happens | After the animation |
| --- | --- | --- |
| **Runaway RSVP** (`runaway-rsvp`) | NO makes a tiny two-hop escape. | NO keeps its new safe position. |
| **Growing Feelings** (`growing-feelings`) | YES grows while NO becomes a little smaller. | Both new sizes remain. |
| **Seat Swap** (`seat-swap`) | YES and NO exchange seats. | The swapped order remains. |
| **Cupid Magnet** (`cupid-magnet`) | NO is pulled toward YES, then gently set down elsewhere. | NO keeps its new safe position. |
| **Paper Plane** (`paper-plane`) | NO folds into a paper plane and flies across the letter. | It lands in a new safe position and stays there. |
| **YES Garden** (`yes-garden`) | Tulips and tiny YES notes bloom around the activation point. | The garden fades away. |
| **Dramatic Excuse** (`dramatic-excuse`) | NO produces a `BUT WHAT IF THERE'S DESSERT?` speech bubble. | The bubble fades without changing the button copy. |
| **Spotlight** (`spotlight`) | A romantic spotlight finds the semantic YES button, even after Seat Swap. | The spotlight fades away. |
| **Tiny Disguise** (`tiny-disguise`) | NO puts on a 🥸 disguise and claims `DEFINITELY YES`. | The disguise remains until the next accepted NO activation, then disappears before that activation continues. |
| **Return to Sender** (`return-to-sender`) | NO receives a `RETURN TO SENDER` stamp and is sent to another landing spot. | The stamp clears; NO keeps its new safe position. |

With Reduced Motion enabled, the same logical end states are preserved without the full travel animations.

## Verification

```powershell
npm test
npm run test:e2e
npm run typecheck
npm run build
```

`tests/e2e/live-smoke.spec.ts` skips during normal local E2E runs. To check an already deployed Pages site, provide its trailing-slash base URL explicitly:

```powershell
$env:PLAYWRIGHT_BASE_URL='https://<owner>.github.io/<repository>/'
npx playwright test tests/e2e/live-smoke.spec.ts
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

On `main`, `.github/workflows/pages.yml` runs unit tests, local browser tests, a production repository-base build, deploys the `dist` artifact to the `github-pages` environment, and then runs the desktop live smoke test against the deployed URL.

## Privacy

The app has no backend, analytics, tracking pixels, cookies, or local storage, and it keeps maker form state only in memory. Invitation values are part of the shared URL, so anyone who receives or records that URL can read them; do not put secrets in the query string. Google Calendar and Telegram receive prefilled details only after Jamie explicitly clicks their respective handoff button, and Jamie must still save or send them.
