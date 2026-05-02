# html-score

A real-time sports score bug overlay for livestreaming software and vision mixers, controlled from a web-based admin panel on any device.

Built for rugby union, rugby league, football, and more — fully self-hostable, no subscriptions, no cloud dependency.

![Sports](https://img.shields.io/badge/sports-rugby%20%7C%20football%20%7C%20more-blue)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## Works with

**Livestreaming software** — OBS Studio, Streamlabs, vMix, XSplit, Wirecast, Restream Studio

**Vision mixers** — vMix, Blackmagic ATEM, NewTek TriCaster, Ross Carbonite, Panasonic AV-HS series

The overlay is a transparent web page — any software that supports a browser source or web input can use it. For hardware vision mixers that can't load HTML directly, see [atem-html-source](https://github.com/bakedpanda/atem-html-source) which renders the overlay and feeds it in via a capture device.

---

## Features

- **Live score control** — increment/decrement scores with one click, controllable from any device on the network
- **Clock** — count up/down with overtime detection and colour changes
- **Discipline cards** — yellow and red cards with per-team timers, including rugby's 20-minute temporary dismissal
- **Multi-sport** — Rugby Union, Rugby League, Football, American Football, Basketball, Ice Hockey, and more
- **Period management** — auto-sets clock to the correct start time when advancing periods; customisable match length
- **Team logos** — circle or full-bleed background mode with scale, opacity, position, rotation, and vignette fade per team
- **Logo colour extraction** — click-to-apply dominant colour swatches pulled automatically from uploaded logos
- **Full style control** — fonts, colours, sizes, corner radius, colour strip, clock panel, card panel
- **Profiles** — save and load named style presets
- **WebSocket sync** — overlay updates in real time with no page refresh

---

## Supported Sports

| Sport | Clock | Cards | Periods |
|-------|-------|-------|---------|
| Rugby Union | count-up | Yellow + 20-min Red | 2 halves |
| Rugby League | count-up | Yellow + Red | 2 halves |
| Football (Soccer) | count-up | Yellow + Red | 2 halves |
| American Football | count-down | — | 4 quarters |
| Basketball | count-down | — | 4 quarters |
| Ice Hockey | count-down | — | 3 periods |
| Netball | count-down | — | 4 quarters |
| Volleyball | — | — | Sets |
| Cricket | — | — | Innings |

---

## Adding the overlay to your software

The overlay URL is shown at the top of the admin panel. Add it as a browser source at your production canvas resolution (e.g. 1920×1080). The background is transparent — place it above your video sources.

| Software | How to add |
|----------|-----------|
| **OBS Studio / Streamlabs** | Sources → Add → Browser Source → paste URL |
| **vMix** | Add Input → Web Browser → paste URL |
| **XSplit** | Add Source → Webpage → paste URL |
| **Wirecast** | Add Layer → Web Page → paste URL |
| **Blackmagic ATEM** | Use [atem-html-source](https://github.com/bakedpanda/atem-html-source) to render and feed the overlay in |
| **TriCaster** | Web browser input → paste URL |

---

## Admin Panel

Open the admin panel on any device on the same network — phone, tablet, or laptop. The overlay link bar at the top of the page shows the correct URL to use.

| Tab | Purpose |
|-----|---------|
| **Score** | Match control — scores, clock, periods, cards |
| **Setup** | Teams, sport, match length, logos |
| **Style** | Full visual customisation |
| **Profiles** | Save/load style presets |

---

## Self-Hosting

### Option 1 — Run locally (Node.js)

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
git clone https://github.com/bakedpanda/html-score.git
cd html-score
npm install
npm start
```

Open http://localhost:3000/admin.html to get started.

---

### Option 2 — Docker (local or server)

Requires [Docker](https://docs.docker.com/get-docker/) with the Compose plugin.

```bash
git clone https://github.com/bakedpanda/html-score.git
cd html-score
docker compose up -d
```

State and uploaded logos are stored in `./data/` and `./public/uploads/` on the host and survive container restarts.

To run on a different port:

```bash
PORT=8080 docker compose up -d
```

---

### Option 3 — Portainer

1. In Portainer, go to **Stacks → Add stack**
2. Choose **Repository** and enter `https://github.com/bakedpanda/html-score`
3. Set the compose file path to `docker-compose.yml`
4. Under **Environment variables**, add `PORT=3000` (or whichever port you want)
5. Deploy the stack

---

### Option 4 — VPS / cloud server

Any Linux VPS (DigitalOcean, Hetzner, Linode, AWS EC2, etc.) works. SSH in and follow the Docker instructions above.

To make it accessible from the internet, either:

**A) Expose the port directly** — open the port in your firewall/security group and access via `http://YOUR_SERVER_IP:3000`

**B) Put it behind a reverse proxy** — recommended if you want HTTPS or a domain name. Example with Nginx:

```nginx
server {
    listen 80;
    server_name score.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

The `Upgrade` and `Connection` headers are required for the WebSocket connection to work through the proxy.

Then use [Certbot](https://certbot.eff.org/) to add a free HTTPS certificate:

```bash
sudo certbot --nginx -d score.yourdomain.com
```

---

## License

GPL-3.0 — see [LICENSE](LICENSE)
