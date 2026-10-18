# Ragnarok

A private training and mindset companion for one person: a four-year plan (36 blocks, 16 habit seasons), a daily check-in that picks today's session type, one-tap logging, and a calm mind practice. Installable on the iPhone home screen, works fully offline.

## Privacy

- This repository holds **code and the plan only**. No profile, injuries, benchmarks, body numbers, logs or tokens are stored here. They are typed in on the phone at first run.
- Data lives in the phone's IndexedDB. An automatic backup goes to a **separate private repository** that you own, through a fine-grained token that stays on the phone.
- No analytics, no trackers. The page may only talk to the GitHub API (Content-Security-Policy). `noindex`, and `robots.txt` disallows everything.
- The build fails if the output contains known personal markers (`npm run scan`).

## Install on the iPhone

1. Open the app's address in **Safari**.
2. Tap **⋯** (next to the address bar), then **Share**.
3. Scroll down and tap **Add to Home Screen**. Keep **Open as Web App** on. Tap **Add**.

These are the iOS 26 steps; menus may differ slightly on newer versions. The app opens full screen and works offline after the first visit.

## Kilos and pounds

Tap **kg | lb** at the top right of any screen. Every weight converts at once: suggested loads, the weigh-in, rep maxes, charts, records, standards and the Ask Claude summary. Values are stored in kilos, so switching back and forth never drifts. In pounds, barbell and machine loads round to 5 lb steps (2 × 2.5 lb plates), added load on a belt to 2.5 lb, and dumbbells to the step set in **Settings → Gym** (2.5 or 5 lb). Height and waist stay in centimetres.

## Backup to GitHub

Do this once.

1. **Create the private repository.** On github.com: **+** → **New repository** → name `ragnarok-data` → **Private** → tick **Add a README file** → **Create repository**.
2. **Create the token.** In the app: **Settings** (tap the emblem) → **Backup to GitHub** → **Create the token on GitHub**. GitHub opens with the name, no expiry and **Contents: Read and write** filled in. Under **Repository access**, choose **Only select repositories** → `ragnarok-data`. Tap **Generate token** and copy it.
   (Without the button: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.)
3. **Paste it in the app** with your GitHub username and `ragnarok-data`, then **Save and back up now**.

The app writes `backup/latest.json` 2 minutes after the last change, on open when the last backup is more than 12 hours old, and when the app is closed with changes waiting. The first backup of each month also writes `backup/monthly/YYYY-MM.json`. Git keeps every version. Settings shows **Last backup**; Today shows a red banner if it is older than 3 days.

**Export JSON / Import JSON** in Settings is a second safety net. Progress photos over 150 KB stay on the phone only.

## Restore on a new phone

Install the app, tap **Restore from GitHub** on the first screen, enter your username, `ragnarok-data` and the token. If both phones have data, entries are merged one by one: the newer one wins (deletes included).

## Deploy

GitHub Pages from `.github/workflows/pages.yml`, the same setup as the other personal apps: every push to `main` runs the tests, builds, runs the privacy scan and deploys `dist/`. If Pages is not enabled yet: repository **Settings → Pages → Source: GitHub Actions**.

## Develop

```sh
npm ci
npm run dev        # local server
npm test           # unit and acceptance tests (Vitest)
npm run e2e        # end-to-end on an iPhone-sized viewport (Playwright, Chromium)
npm run build      # type-check and build to dist/
npm run scan       # fail if personal data reached dist/
npm run icons      # redraw the emblem and PWA icons (needs Chromium)
npm run art        # repaint the fjord background and the grain texture (needs Chromium)
```

Optional local fixture for test 12 with real numbers: `tests/private.local.json` (git-ignored, never commit it).

## Where things are

| Path | What |
|---|---|
| `src/plan` | The plan: blocks, templates, seasons, rotations, content (brief section 6) |
| `src/engine` | Deterministic rules: position, loads, readiness, session types, scheduling, tasks, nutrition, insights, trophies, Ask Claude pack |
| `src/db`, `src/sync` | IndexedDB (Dexie), merge, GitHub backup and restore |
| `src/screens`, `src/ui` | Today, Train, Mind, Log, Stats, Settings, setup, PIN, Ask Claude |
| `tests` | Acceptance tests 1 to 17 and the 5.3b unit tests |
| `e2e` | Browser tests: setup, check-in, logging, Ask Claude, offline, phone width |
| `PLAN.md`, `CHANGELOG.md` | Architecture, data model, choices; what changed per milestone |

Not medical advice.
