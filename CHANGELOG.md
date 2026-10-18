# Changelog

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
