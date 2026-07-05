# Cutpurse

A thieving campaign of ten nights, played by lantern-light. Tap a mark to lift their
purse — but only while every watchman's lantern looks away. Meet the Guild's coin quota
before dawn to advance; get caught three times and you lose the night's take.

## The campaign

Each night is a new district with a bigger quota and a meaner watch: faster lanterns,
tighter reversals, then walking **patrol watchmen** with beams of their own, **merchants**
whose theft raises a commotion (the watch turns furious and fast), wandering **nobles**,
and disguised **constables** — bait purses carried by the watch; mind the red plume.
Clear the tenth night, the Palace Court, to finish the campaign.

## Progression

- **Relics** — every five purses a fence offers a pick of run-long boons.
- **The Thieves' Guild** — coin banked at dawn buys permanent skills in a three-branch,
  nine-node tree (Fingers / Shadow / Guile): richer purses, extra luck, smoke charges,
  longer nights, better fences. Progress persists in `localStorage`.

Built as an installable **TypeScript PWA** (offline-capable, add-to-home-screen) rendered
on a 2D canvas: moonlit sky that warms toward dawn, cobbled plaza with market stalls and
torch flames, drifting fog, flickering lantern beams with dust motes, a quota arc around
the plaza rim, coin bursts, screen shake, and a tiny WebAudio synth for effects.

## Develop

```sh
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
npm run icons     # regenerate public/icons/*.png (no deps, pure Node)
```

Source layout: `src/game.ts` (simulation), `src/levels.ts` (night definitions),
`src/progression.ts` (skill tree + save), `src/render.ts` (canvas art),
`src/sound.ts` (synth), `src/main.ts` (wiring).

## Deploy

Pushes to `main` deploy automatically to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup: in the repository settings, under **Settings → Pages**, set
**Source** to **GitHub Actions**.
