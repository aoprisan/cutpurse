# Cutpurse

A small arcade game of theft and lantern-light. Tap a mark to lift their purse — but only
while the watchman's lantern looks away. Three mistakes and the stocks await. Every five
purses, a fence offers you a relic.

Built as an installable **TypeScript PWA** (offline-capable, add-to-home-screen) rendered
on a 2D canvas: moonlit sky that warms toward dawn, cobbled plaza, rooftop silhouettes,
flickering lantern beam with dust motes, coin bursts, and screen shake.

## Develop

```sh
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
npm run icons     # regenerate public/icons/*.png (no deps, pure Node)
```

## Deploy

Pushes to `main` deploy automatically to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup: in the repository settings, under **Settings → Pages**, set
**Source** to **GitHub Actions**.
