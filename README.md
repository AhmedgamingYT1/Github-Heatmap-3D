# GitHub Heatmap 3D

Turn any GitHub contribution graph into an interactive, 360° rotatable 3D bar chart. Every day is a bar whose height matches that day's contribution count.

## Features

- Load any public GitHub user's contributions for any year (2008 onward)
- Full 360° orbit: drag to rotate, scroll to zoom, right-drag to pan
- Hover a bar to see the date and count
- Height slider and log scale
- Stats: total, best day, longest streak
- Export the model as an STL for 3D printing

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/?user=YOUR_USERNAME&year=2026`.

## Data

Contributions come from the public [github-contributions-api](https://github.com/grubersjoe/github-contributions-api), which reads public profile calendars (no token needed).

Built with [Three.js](https://threejs.org) and [Vite](https://vite.dev).
