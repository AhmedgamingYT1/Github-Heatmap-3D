# GitHub Heatmap 3D

Turn any GitHub contribution graph into an interactive, 360° rotatable 3D model, then put it on your website or your GitHub README.

Every day is a bar whose height matches that day's contribution count.

## Styles

| Style | What it shows |
|---|---|
| **City** | One bar per day, as tall as that day's contributions. 8 color themes. |
| **Night City** (Pro) | The city after dark: lit windows, rooftop lights and stars. |
| **Galaxy** (Pro) | A spiral galaxy from January at the core to December at the rim. Every day is a star; the biggest days are planets. |
| **Forest** (Pro) | A floating island where each day grows a plant: sprouts for quiet days, big trees (some in bloom) for big ones. |
| **Heartbeat** (Pro) | A heart monitor sweeping through the year, one beat per day. |

## Your year as a song (Pro)

Every profile gets its own song, composed from its contributions. The key, scale and chords come from the username, the tempo from how much was shipped, and every day is one note: busy days play melody and drums, quiet stretches drift into soft pads. Play it on the site while the 3D view follows along, or download it as a WAV file.

## Features

- Any public GitHub user, any year from 2008
- Full 360° orbit: drag to rotate, scroll to zoom, right-drag to pan
- 8 themes: Sand, Ocean, GitHub Dark, GitHub Light, Sunset, Forest, Neon, Halloween
- Customize everything: bar size, height, log scale, shadows, base, labels, rotation speed and direction, saved camera angle, transparent background
- Embed it anywhere: iframe, one-line script tag, or a README image
- Export an STL file for 3D printing

## Use it

Open the site, enter your username, then click **Customize & Embed**. Adjust the settings, rotate the model to the angle you like and click **Save this view**. Then copy the code for:

| Where | What you get |
|---|---|
| **Website** (iframe) | Fully interactive 3D |
| **Script** tag | Fully interactive 3D; options are editable `data-*` attributes |
| **README** | A 3D-style image (GitHub READMEs can't run scripts) that links to the interactive version |
| **Link** | A shareable link to your exact view |

### Website

```html
<iframe src="https://YOUR-SITE/embed.html?user=octocat&theme=ocean"
  style="width: 100%; height: 420px; border: 0" loading="lazy"></iframe>
```

### Script tag

```html
<div data-github-heatmap-3d data-user="octocat" data-theme="sunset" data-transparent="1"
  style="width: 100%; height: 420px"></div>
<script src="https://YOUR-SITE/embed.js" async></script>
```

### GitHub README

```md
[![My contributions in 3D](https://YOUR-SITE/api/heatmap?user=octocat&theme=sand)](https://YOUR-SITE/?user=octocat)
```

## Options

The same names work as URL params (`?autoRotate=0`), script attributes (`data-auto-rotate="0"`) and image API params. Booleans take `1` / `0`.

| Option | Default | Description |
|---|---|---|
| `user` | – | GitHub username (sample data when empty) |
| `year` | current year | 2008 to now |
| `style` | `city` | `city`, `night`, `galaxy`, `forest`, `heartbeat` |
| `theme` | `sand` | City colors: `sand`, `ocean`, `github`, `github-light`, `sunset`, `forest`, `neon`, `halloween` |
| `height` | `8` | Height of the tallest bar (2–20) |
| `log` | `0` | Log scale, so quiet days stay visible next to busy ones |
| `barSize` | `0.82` | Bar footprint, 0.3–1 (1 = no gaps) |
| `shadows` | `1` | Shadows |
| `base` | `1` | The base under the grid |
| `labels` | `1` | Month and weekday labels |
| `title` | `1` | Username and year (plus total on the image) |
| `transparent` | `0` | No background, to blend into any page |
| `autoRotate` | `1` | Spin automatically |
| `rotateSpeed` | `0.8` | -5 to 5; negative spins clockwise |
| `interactive` | `1` | Drag to rotate |
| `zoom` | `1` | Scroll to zoom |
| `tooltip` | `1` | Show date and count on hover |
| `camera` | – | Starting camera position `x,y,z` (set by **Save this view**) |
| `badge` | `1` | Small "Open in 3D" link on embeds |
| `music` | `0` | "Play your year" song button on embeds |
| `angle` | `-20` | Image only: view angle around the board, in degrees |
| `tilt` | `30` | Image only: view angle above the board, 5–85 degrees |

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The README image API runs at `/api/heatmap` in dev too.

## Deploy

Built for [Vercel](https://vercel.com): import the repo and deploy. The static site goes to the CDN and `api/heatmap.js` becomes a serverless function. If the site is served from a different public URL than the one users visit, set `VITE_SITE_URL` so the copied snippets point to it.

## Project layout

```
index.html, src/main.js     the site: editor + embed code generator
embed.html, src/embed.js    bare 3D view for iframes
public/embed.js             script-tag loader (creates the iframe)
api/heatmap.js              README image endpoint (SVG)
src/lib/heatmap.js          the 3D component: createHeatmap(element, options)
src/lib/styles/             City / Night City, Galaxy, Forest, Heartbeat
src/lib/song.js             song composer, player and WAV export
src/lib/svg.js              3D-style SVG renderer for images
src/lib/options.js          every option, its default and URL format
src/lib/themes.js           color themes
src/lib/data.js             contribution data + stats
```

## Data

Contributions come from the public [github-contributions-api](https://github.com/grubersjoe/github-contributions-api), which reads public profile calendars (no token needed). Private contributions only appear if the user has turned on "Include private contributions" on their GitHub profile.

Built with [Three.js](https://threejs.org) and [Vite](https://vite.dev).
