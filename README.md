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

The first eight NO attempts use non-repeating playful tricks. After the eighth attempt, a genuine refusal option appears; Jamie must activate it and explicitly confirm once more before the refusal is accepted respectfully.

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
