# Changelog

## Kilos and pounds

- A **kg | lb** switch in the header, on every screen, one tap. It is also in Settings → Gym and on the first setup screen.
- Everything is still stored in kilos; only what is shown and typed changes, so no data moves and switching back gives the same numbers.
- In pounds, loads round to plates you can actually load: 5 lb steps on barbells, cables and machines, 2.5 lb for added load on a belt, 10 lb on the sled, dumbbells at 2.5 or 5 lb (setting). A clean W5 offers +5 lb instead of +2.5 kg.
- Converted: Train loads and badges, why-this-load text, the weigh-in, rep max and body forms, standards and their targets, Stats charts and records, trophies, insights, the weekly review, calorie trend reasons and the Ask Claude context pack.
- Height and waist stay in centimetres.
- Tests: unit conversion and plate rounding (6 unit tests), and two browser tests (switch converts live; setup in pounds stores kilos).

## Emblem: rustic Omega

- At the owner's request the emblem is now a rustic Omega: chiseled, forged ember-red iron with hammered facets, an embossed bevel, dents, grain and cracks glowing like hot iron, on dark stone with an ember glow. It replaces the axe and blades.
- An original drawing of the Greek letter, not a copy of any game logo. Header mark, favicon and the 180, 192 and 512 px icons regenerated with `npm run icons`.

## M8: Ask Claude, polish, accessibility, README

- Ask Claude: quick prompts or free text, a compact plain-text context pack (safety line first, profile from the phone), copied to the clipboard, then claude.ai opens. Nothing is sent by the app.
- Accessibility: labels on every control, icon plus word for every session type, 44 px tap targets, reduced motion, no horizontal scroll (checked by a browser test on each screen).
- A label wrapping button groups named only the first button; fixed with a group field.
- Light days with back pain apply the stricter of the two load rules once (60% of usual), not both.
- README: deploy, private repository and token, iPhone install, restore.
- Browser tests on an iPhone-sized viewport: setup, Full / Light / Recovery check-ins, set and weight logging with clean or hard, finishing with feedback, Ask Claude clipboard, offline start, robots and manifest.

## M7: storage, backup, export, PIN

- IndexedDB through Dexie; every record has `updatedAt`; deletes are soft so restores never bring them back.
- Automatic backup to `backup/latest.json` (2 minutes after a change, on open after 12 hours, on close with pending changes), monthly copy, restore with per-record merge, export and import JSON.
- A change during an upload now gets its own upload right after (found by the backup test).
- Optional 4-digit PIN, PBKDF2-hashed, asked on open and after 5 minutes away.
- Tests: acceptance 16 (mocked GitHub API) and 17 (build scan, also run in the deploy workflow).

## M6: Log and Stats

- Log: activity (several cardio entries a day), sleep for any past day, rep max with "Due" highlighting, body with photos, standards; every history list edits and deletes.
- Stats: road progress, weight 7-day average against the plan line with phase bands, body fat and lean mass with FFMI, e1RM per lift, working weight per exercise, records, standards, check-in heatmap, habits by season, sleep, activity, readiness against the session served, trophies.

## M5: Mind

- Season card with the "When X, I do Y" line, every active habit with this week's dots, the road, the practice ladder, the reference cards.
- Sunday review with the week's stats, the engine's suggestion and "Copy my week for Claude"; season scores with the under-6 flag.

## M4: Today and Train

- Today: position line, check-in with the badge and one-line reason, tasks with inline inputs (steps ring, weigh-in, waist, cardio, mobility, daily code), eat today, up to 3 insight cards, 14-day streak.
- Train: session-type badge with "Use the full session anyway", block card, the session with pre-filled weights, up / hold / down badges with reasons, set dots that start the rest timer, clean or hard, finish with RPE and main-lift feel, cardio and mobility with a log button, travel mode, pause plan, the week, the next block.

## M3: readiness and the intelligence layer

- Readiness score with every deduction from 5.3, personal 28-day baselines after 14 days, and a bounded calibration (plus or minus 5, one point a week, after 8 weeks, resettable).
- Pain rules override the score: Recovery, Upper only, Spine-sparing, Knee-sparing. Overrides never go above what a pain rule allows. Doctor or osteopath card after two days of back pain 5+ or pain down the leg.
- Session feedback loop: easy twice +2.5% e1RM, hard twice -2.5%, RPE 9+ on a Full day starts the next session of that type at Moderate loads.
- Missed heavy day offers that slide the week (never two leg days in a row, max 6 lifting days in 7), early reload, sleep pattern, steps, cardio balance, look-ahead, plateau, clean-W5 +2.5 kg, 14-day calorie trend, habit adherence and the no-stacking rule.
- Insight cards ranked: safety, session, nutrition, habits.
- Tests: acceptance 7 to 11, 12a, 13; 5.3b items 2, 3 (bounds), 4 and 7.

## M2: plan engine

- Plan data from the brief (36 blocks, 20 seasons, both templates, rotations), extracted verbatim. Static "about X kg" load notes removed because they reveal the benchmarks; percentages kept.
- Position with pauses (the map slides), week types and RIR, yearly main-lift rotation, accessory rotation, phase and week modifiers.
- Suggested loads: percentage tables, load for target, weighted pull-up from bodyweight, variations from 90% of the previous lift.
- Daily task schedule for training and mind, block-start tasks, rep-max tests.
- Tests: acceptance 1 to 6, 12, 14, 15. Test 12 runs on neutral numbers in the repository and on the real numbers from a local, git-ignored fixture.

## M1: setup

- Hosting copied from the existing app repository: GitHub Pages from an Actions workflow on every push to `main`, with tests, build and the privacy scan added.
- Vite, React, TypeScript with pinned versions. Original emblem (bearded axe, two curved blades, a chain) rendered to the PWA icons.
- Manifest, service worker with a build-time precache list, `noindex`, `robots.txt`, Content-Security-Policy.
