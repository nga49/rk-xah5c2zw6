# Ragnarok: build plan

A private, offline-first training and mindset companion for one person. Installable PWA, hosted free on GitHub Pages, data on the phone with an automatic backup to a private GitHub repository.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| UI | React 19.1 + TypeScript 5.9, Vite 7 | Brief default; typed engine shared by UI and tests |
| Routing | Hash routes (`#/today`, `#/train`, ...) | No 404s on a GitHub Pages subpath |
| Storage | IndexedDB through Dexie 4.0 (`dexie-react-hooks` for live queries) | Local source of truth, every record has `updatedAt` |
| Engine | Pure functions in `src/engine`, no React, no DB | Deterministic, offline, unit-tested, explains itself |
| Charts | Small hand-written SVG components | One y-axis, tap for values, no extra dependency |
| Fonts | `@fontsource` packages bundled by Vite | Self-hosted Cinzel, Hanken Grotesk, Noto Sans Runic |
| Offline | Hand-written service worker, precache list injected at build time | Same strategy as the existing apps: network first for the page, cache fallback |
| Hosting | GitHub Pages from `.github/workflows/pages.yml` | Copied from the existing app repo, plus `npm ci`, tests, build and the privacy scan |
| Backup | GitHub REST contents API from the browser, fine-grained token for one private repo | Verified: CORS allowed from any origin; token needs Contents read and write |

Nothing personal ships in the code: profile, injuries, benchmarks, body numbers, logs and the token are typed in on the phone. The build fails if `163.6`, `L4` or `hernia` appear in the output. The repository name is unremarkable, pages are `noindex`, `robots.txt` disallows everything, and a Content-Security-Policy only allows the GitHub API as an outside host.

## Engine (src/engine)

Everything is derived from raw logs on each render, so state never drifts and every number can say why.

- `dates`: local calendar dates as `YYYY-MM-DD`, day arithmetic in UTC to dodge DST.
- `position` (5.1): pause shift (`planDate = date - sum(min(N, date - pauseStart))`), block, week, week type, RIR, template, season, road week.
- `formulas` (5.2): Epley, load for target, rounding, lean mass, FFMI, weekly average.
- `session`: template for the day, yearly main-lift rotation, accessory rotation, week type and phase modifiers, session-type modifiers (Full, Moderate, Light, Spine-sparing, Knee-sparing, Upper only, Recovery, Travel), 3RM tests.
- `loads` (5.4): e1RM per lift (test, else benchmark, else 90% of the previous variation), feedback adjustments, percentage tables, load for target.
- `progression`: accessory +step after 2 clean, hold after 1 hard, drop 5% after 2 hard; main lift hold after hard.
- `readiness` (5.3, 5.3b): score with deductions, personal 28-day baselines after 14 days, bounded calibration, pain rules, bands.
- `schedule` (5.3): missed heavy day, recovery on a heavy day, early reload, load management across the week.
- `tasks` (5.6), `nutrition` (5.5), `insights` (5.7, priority order), `trophies` (5.9), `audit` (6.3), `context` (Ask Claude pack).

## Data model (IndexedDB, all records `{ id, updatedAt, deleted? }`)

| Table | Key | Content |
|---|---|---|
| `profile` | `me` | name, height, birth year, goal, injuries, rules, start date, units, PIN hash and salt, gym options, dumbbell step, calibration reset date |
| `days` | date | check-in, readiness snapshot, override, tasks, steps, mobility, session sets, travel mode, feedback (RPE, main lift feel), notes |
| `cardio` | uuid | date, type, minutes, avg HR, feel |
| `maxes` | uuid | date, lift, kg, reps, e1RM, source `test` or `benchmark` |
| `body` | uuid | date, weight, body fat and source, waist, photo ids |
| `standards` | uuid | date, standard, value |
| `weights` | uuid | date, exercise, kg, mark `clean` / `hard` / none |
| `reviews` | week start | three answers, stats snapshot, suggestion |
| `seasonScores` | season:habit | score 1 to 10 |
| `kcalAdjust` | uuid | block code, offset, date, reason |
| `plan` | uuid | pauses, early reloads, schedule swaps, lift variation and +2.5 kg choices |
| `dismissed` | insight id | dismissed insight cards |
| `photos` | uuid | small JPEG (in the backup only when small) |
| `device` | key | never backed up: GitHub user, repo, token, last backup, pending flag |

Deletes are soft (`deleted: true`) so a restore or merge never brings a deleted record back. Merge rule: per record, the newer `updatedAt` wins.

## Backup

`backup/latest.json` is written 2 minutes after the last change, on open when the last backup is over 12 hours old, and when the app is hidden with pending changes. The first backup of each month also writes `backup/monthly/YYYY-MM.json`. Restore reads `latest.json` and merges per record. Manual export and import use the same JSON.

## Choices the brief left open (cheap to change)

- **Pauses and weekdays.** Blocks and seasons slide by exactly N days; the session still follows the real weekday. Quick picks are whole weeks so blocks keep starting on Mondays.
- **Volume weeks.** "+1 set" on trap and delt exercises in W3 and W4 only; W5 is as written with RIR 1 (isolation may reach 0).
- **Review W2 to W4.** Volume template at normal sets, RIR 2.
- **3RM test.** "Work up to a heavy 3, stop when speed drops, 1 rep in reserve": never a grind on a spine-loaded lift. e1RM uses the plain Epley formula, which is conservative here.
- **2 hard marks.** Drop 5% and round to the nearest available weight, but always at least one step down (otherwise 14 kg dumbbells would round back to 14).
- **Main lifts and hard marks.** One hard mark holds the load; two "hard" main-lift feelings in a row lower the working e1RM 2.5% (5.3b).
- **Baselines (5.3b.1).** After 14 days: sleep 60+ min under the 28-day average, sleep score 10+ under, resting HR 5+ over (when the 7-day rule did not already fire), Body Battery 15+ under: 5 points each.
- **Calibration (5.3b.3).** After 8 weeks, each week: a session felt better than predicted when the score was under the Full line but RPE was 7 or less and the main lift felt easy or right; worse when the day was Full but RPE 9+ or the main lift felt hard. Two or more one way and none the other moves the thresholds one point, within plus or minus 5.
- **Radiating pain, numbness or weakness** is a check-in toggle: Recovery and the doctor or osteopath card.
- **Template load notes.** Percentages are kept; the static "about X kg" parts are removed from the public code because they reveal the benchmarks. The app shows the real number computed on the phone.
- **Ask Claude.** Copies the pack and opens `claude.ai/new`. The `?q=` prefill is undocumented and would put health details in a URL, so it is not used.

## Milestones

1. Hosting copied from the existing app, project setup, design tokens, emblem, PWA shell, navigation, Pages workflow.
2. Plan engine (5.1, 5.2, 5.4, 5.6), tests 1 to 6, 12, 14, 15.
3. Check-in, readiness, session types, intelligence layer (5.3, 5.3b), tests 7 to 11, 13 and the 5.3b unit tests.
4. Today and Train: loads, one-tap logging, rest timer, cardio and mobility, travel mode, pause plan.
5. Mind: seasons, habits, road, ladder, Sunday and season reviews, reference cards.
6. Log and Stats with charts and trophies.
7. Storage, automatic GitHub backup and restore, export and import, PIN, tests 16 and 17.
8. Ask Claude, polish, accessibility, iPhone viewport test, README.
