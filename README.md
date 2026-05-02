# html-score

A real-time sports score bug overlay for OBS and browser-source streaming, controlled via a web admin panel.

![Sports Score Overlay](https://img.shields.io/badge/sports-rugby%20%7C%20football%20%7C%20more-blue)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

## Features

- **Live score control** — increment/decrement scores with one click
- **Clock** — count up/down with overtime detection and colour changes
- **Discipline cards** — yellow and red cards with per-team timers (including rugby's 20-min dismissal)
- **Multi-sport** — Rugby Union, Rugby League, Football, American Football, Basketball, Ice Hockey, and more
- **Period management** — auto-sets clock to correct start time when advancing periods
- **Logo backgrounds** — per-team logo display with scale, opacity, position, rotation, and vignette fade controls
- **Logo colour extraction** — click-to-apply dominant colour swatches pulled from uploaded logos
- **Full style control** — fonts, colours, sizes, corner radius, colour strip, clock panel, card panel
- **Profiles** — save and load named style presets
- **WebSocket sync** — overlay updates in real time with no page refresh
- **OBS-ready** — transparent background, browser source compatible

## Quick Start

### Node.js

```bash
npm install
npm start
```

Then open:
- **Admin panel**: http://localhost:3000/admin.html
- **Overlay** (add as Browser Source in OBS): http://localhost:3000/overlay.html

### Docker

```bash
docker compose up -d
```

Data and uploaded logos are persisted in `./data/` and `./public/uploads/` on the host.

To use a different port:

```bash
PORT=8080 docker compose up -d
```

## OBS Setup

1. Add a **Browser Source** in OBS
2. Set the URL to `http://localhost:3000/overlay.html`
3. Set width/height to match your canvas (e.g. 1920×1080)
4. Enable **"Shutdown source when not visible"** if you want the clock to pause off-stream
5. The overlay background is transparent — place it above your video sources

## Admin Panel

Open `http://localhost:3000/admin.html` on any device on the same network (use your machine's local IP instead of `localhost`).

### Tabs

| Tab | Purpose |
|-----|---------|
| **Score** | Match control — scores, clock, periods, cards |
| **Setup** | Teams, sport, match length, logos |
| **Style** | Full visual customisation |
| **Profiles** | Save/load style presets |

## Supported Sports

| Sport | Clock | Cards | Periods |
|-------|-------|-------|---------|
| Rugby Union | ✓ count-up | Yellow + 20-min Red | 2 halves |
| Rugby League | ✓ count-up | Yellow + Red | 2 halves |
| Football (Soccer) | ✓ count-up | Yellow + Red | 2 halves |
| American Football | ✓ count-down | — | 4 quarters |
| Basketball | ✓ count-down | — | 4 quarters |
| Ice Hockey | ✓ count-down | — | 3 periods |
| Netball | ✓ count-down | — | 4 quarters |
| Volleyball | — | — | Sets |
| Cricket | — | — | Innings |

## License

GPL-3.0 — see [LICENSE](LICENSE)
