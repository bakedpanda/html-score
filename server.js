const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'data', 'state.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const PROFILES_DIR = path.join(__dirname, 'data', 'profiles');

[path.join(__dirname, 'data'), UPLOADS_DIR, PROFILES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Auth ──────────────────────────────────────────────────────────────
const AUTH_FILE      = path.join(__dirname, 'data', 'auth.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim().replace(/^["']|["']$/g, '') || null;
const COOKIE_SECRET  = process.env.COOKIE_SECRET  || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME    = 'sb_auth';

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(secret, salt, 64).toString('hex');
}
function verifySecret(secret, stored) {
  const colon = stored.indexOf(':');
  const salt = stored.slice(0, colon);
  const hash = stored.slice(colon + 1);
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(secret, salt, 64)); }
  catch { return false; }
}
function generateRecoveryKey() {
  const hex = crypto.randomBytes(12).toString('hex').toUpperCase();
  return `${hex.slice(0,6)}-${hex.slice(6,12)}-${hex.slice(12,18)}-${hex.slice(18,24)}`;
}
function getAuthMode() {
  if (fs.existsSync(AUTH_FILE)) return 'file';
  if (ADMIN_PASSWORD) return 'env';
  return 'setup';
}

function signValue(val) {
  return val + '.' + crypto.createHmac('sha256', COOKIE_SECRET).update(val).digest('base64url');
}
function verifySignedCookie(signed) {
  if (!signed) return false;
  const dot = signed.lastIndexOf('.');
  if (dot < 1) return false;
  const val = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(val).digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) && val === 'admin';
  } catch { return false; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}
function requireAuth(req, res, next) {
  const mode = getAuthMode();
  if (mode === 'setup') return res.redirect('/setup');
  if (verifySignedCookie(parseCookies(req)[COOKIE_NAME])) return next();
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Unauthorised' });
  res.redirect('/login');
}

function recoveryKeyPage(key) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Score Bug — Save Your Recovery Key</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0b0d11; color: #e2e8f0; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .box { background: #131720; border: 1px solid #252b3a; border-radius: 10px; padding: 36px 32px; width: 100%; max-width: 460px; }
  .title { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 8px; text-align: center; }
  .title span { color: #3b82f6; }
  .sub { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 28px; }
  .key-box { background: #0b0d11; border: 1px solid #94a3b8; border-radius: 8px; padding: 18px 20px; font-family: monospace; font-size: 20px; letter-spacing: 0.12em; text-align: center; color: #e2e8f0; margin-bottom: 20px; }
  .warn { background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); color: #eab308; border-radius: 6px; padding: 12px; font-size: 13px; margin-bottom: 20px; line-height: 1.5; }
  label.check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 14px; margin-bottom: 20px; color: #a0aec0; line-height: 1.4; }
  input[type=checkbox] { width: 16px; height: 16px; margin-top: 2px; accent-color: #94a3b8; flex-shrink: 0; }
  button { width: 100%; background: #94a3b8; color: #0c0d0f; border: none; border-radius: 6px; padding: 11px; font-size: 14px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; opacity: 0.35; pointer-events: none; transition: opacity 0.15s; }
  button.ready { opacity: 1; pointer-events: auto; }
  button.ready:hover { background: #b0bfcf; }
</style>
</head>
<body>
<div class="box">
  <div class="title">Score<span>Bug</span></div>
  <p class="sub">Password set — save your recovery key</p>
  <div class="key-box">${key}</div>
  <div class="warn">&#x26A0;&#xFE0F; This key is shown once and cannot be recovered. Write it down or store it somewhere safe. You will need it if you forget your password.</div>
  <label class="check">
    <input type="checkbox" id="ack" onchange="document.getElementById('btn').classList.toggle('ready',this.checked)">
    I have saved my recovery key in a safe place
  </label>
  <button id="btn" onclick="location.href='/admin.html'">Continue to Admin Panel</button>
</div>
</body>
</html>`;
}

// Seed default profiles if they don't already exist
const SEEDS_DIR = path.join(__dirname, 'data', 'seeds');
if (fs.existsSync(SEEDS_DIR)) {
  fs.readdirSync(SEEDS_DIR).filter(f => f.endsWith('.json')).forEach(f => {
    const dest = path.join(PROFILES_DIR, f);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(SEEDS_DIR, f), dest);
  });
}

function listProfiles() {
  return fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

const SPORTS = {
  rugby_union: {
    name: 'Rugby Union',
    periods: 2, maxPeriods: 4,
    periodNames: ['Half 1', 'Half 2', 'ET 1', 'ET 2'],
    clockDirection: 'up',
    periodDurations: [40*60, 40*60, 10*60, 10*60],
    overtimeFormat: 'red',
    scoreButtons: [
      { label: 'Try', value: 5 }, { label: 'Conv', value: 2 },
      { label: 'Pen', value: 3 }, { label: 'DG',   value: 3 },
    ],
    hasCards: true,
  },
  rugby_league: {
    name: 'Rugby League',
    periods: 2, maxPeriods: 4,
    periodNames: ['Half 1', 'Half 2', 'ET 1', 'ET 2'],
    clockDirection: 'up',
    periodDurations: [40*60, 40*60, 10*60, 10*60],
    overtimeFormat: 'red',
    scoreButtons: [
      { label: 'Try', value: 4 }, { label: 'Conv', value: 2 },
      { label: 'Pen', value: 2 }, { label: 'Drop', value: 1 },
    ],
    hasCards: true,
  },
  football: {
    name: 'Football',
    periods: 2, maxPeriods: 4,
    periodNames: ['Half 1', 'Half 2', 'ET H1', 'ET H2'],
    clockDirection: 'up',
    periodDurations: [45*60, 45*60, 15*60, 15*60],
    // base minutes at start of each period (for "45+N" display)
    periodBases: [0, 45, 90, 105],
    overtimeFormat: 'additive',
    scoreButtons: [{ label: 'Goal', value: 1 }],
    hasCards: true,
  },
  basketball: {
    name: 'Basketball',
    periods: 4, maxPeriods: 5,
    periodNames: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'],
    clockDirection: 'down',
    periodDurations: [10*60, 10*60, 10*60, 10*60, 5*60],
    overtimeFormat: 'red',
    scoreButtons: [
      { label: '1pt', value: 1 }, { label: '2pt', value: 2 }, { label: '3pt', value: 3 },
    ],
    hasCards: false,
  },
  ice_hockey: {
    name: 'Ice Hockey',
    periods: 3, maxPeriods: 4,
    periodNames: ['Period 1', 'Period 2', 'Period 3', 'OT'],
    clockDirection: 'down',
    periodDurations: [20*60, 20*60, 20*60, 5*60],
    overtimeFormat: 'red',
    scoreButtons: [{ label: 'Goal', value: 1 }],
    hasCards: false,
  },
  netball: {
    name: 'Netball',
    periods: 4, maxPeriods: 4,
    periodNames: ['Q1', 'Q2', 'Q3', 'Q4'],
    clockDirection: 'up',
    periodDurations: [15*60, 15*60, 15*60, 15*60],
    overtimeFormat: 'red',
    scoreButtons: [{ label: 'Goal', value: 1 }],
    hasCards: true,
  },
  generic: {
    name: 'Generic',
    periods: 4, maxPeriods: 8,
    periodNames: null,
    clockDirection: 'up',
    periodDurations: [],
    overtimeFormat: 'red',
    scoreButtons: [{ label: '+1', value: 1 }],
    hasCards: true,
  },
};

const DEFAULT_STATE = {
  sport: 'rugby_union',
  home: {
    name: 'Home Team',
    shortName: 'HME',
    color: '#c8102e',
    score: 0,
    yellowCards: 0,
    redCards: 0,
    logo: null,
    logoMode: 'circle',
    logoBgScale: 1.5,
    logoBgX: 0,
    logoBgY: 0,
    logoBgRotation: 0,
    logoBgOpacity: 40,
    logoBgFadeStart: 50,
    logoBgFadeEnd: 100,
    logoInvert: false,
  },
  away: {
    name: 'Away Team',
    shortName: 'AWY',
    color: '#001489',
    score: 0,
    yellowCards: 0,
    redCards: 0,
    logo: null,
    logoMode: 'circle',
    logoBgScale: 1.5,
    logoBgX: 0,
    logoBgY: 0,
    logoBgRotation: 0,
    logoBgOpacity: 40,
    logoBgFadeStart: 50,
    logoBgFadeEnd: 100,
    logoInvert: false,
  },
  clock: {
    running: false,
    elapsed: 0,
    direction: 'up',
  },
  period: 1,
  periodMins: null,
  display: {
    visible: true,
    showClock: true,
    showCards: true,
    showPeriod: true,
    showLogos: true,
  },
  position: { x: 20, y: 20 },
  scale: 1.0,
  bugStyle: {
    useShortName: true,
    // Names
    nameFont: 'Russo One',
    nameSize: 22,
    nameColor: '#ffffff',
    // Scores
    scoreSize: 42,
    scoreColor: '#ffffff',
    scoreBoxBg: '#13171f',
    scoreBoxRadius: 7,
    // Bug container
    bugBgColor: '#080b10',
    bugBgOpacity: 92,
    bugRadius: 10,
    // Color strip
    showStrip: true,
    stripHeight: 4,
    // Clock
    clockSize: 13,
    clockColor: '#a8b5c8',
    clockRunningColor: '#4ade80',
    clockOvertimeColor: '#e63946',
    // Period
    periodSize: 13,
    periodColor: '#667388',
    // Score flash
    showFlash: true,
    flashColor: '#ffd700',
    // Logo presentation
    logoMode: 'circle',
    logoBgScale: 1.5,
    logoBgX: 0,
    logoBgY: 0,
    logoBgRotation: 0,
    logoBgOpacity: 40,
    // Fonts
    scoreFont: 'Russo One',
    clockFont: 'Russo One',
    // Name block padding
    namePadH: 8,
    // Clock panel background (null = inherit bug bg)
    clockBgColor: null,
    clockBgOpacity: null,
    clockPadH: 16,
    // Card panel
    cardPanelPosition: 'bottom',
    cardPanelScale: 1.0,
    cardPanelBgOpacity: 92,
    // Panel gradient
    bugGradientEnabled: false,
    bugGradientStart: 40,
    bugGradientEnd: 80,
  },
  externalClock: {
    side: 'right',
    showPeriod: true,
  },
};

let state = structuredClone(DEFAULT_STATE);

if (fs.existsSync(STATE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = { ...DEFAULT_STATE, ...saved };
    state.home = { ...DEFAULT_STATE.home, ...saved.home, shortName: saved.home?.shortName ?? DEFAULT_STATE.home.shortName };
    state.away = { ...DEFAULT_STATE.away, ...saved.away, shortName: saved.away?.shortName ?? DEFAULT_STATE.away.shortName };
    state.clock = { ...DEFAULT_STATE.clock, ...saved.clock, running: false };
    state.display = { ...DEFAULT_STATE.display, ...saved.display };
    state.position = { ...DEFAULT_STATE.position, ...saved.position };
    state.scale = saved.scale != null ? saved.scale : DEFAULT_STATE.scale;
    state.bugStyle = { ...DEFAULT_STATE.bugStyle, ...saved.bugStyle };
    state.externalClock = { ...DEFAULT_STATE.externalClock, ...saved.externalClock };
    state.periodMins = saved.periodMins ?? DEFAULT_STATE.periodMins;
  } catch (e) {
    console.warn('Could not load saved state, using defaults.');
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let clockInterval = null;
let lastTick = null;

function startClock() {
  if (clockInterval) return;
  lastTick = Date.now();
  state.clock.running = true;
  clockInterval = setInterval(() => {
    const now = Date.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;

    if (state.clock.direction === 'up') {
      state.clock.elapsed += delta;
    } else {
      state.clock.elapsed = Math.max(0, state.clock.elapsed - delta);
      if (state.clock.elapsed <= 0) {
        stopClock();
      }
    }

    broadcast({ type: 'clockTick', elapsed: state.clock.elapsed, running: state.clock.running });
  }, 250);
}

function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  state.clock.running = false;
  saveState();
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastState() {
  broadcast({ type: 'state', data: state, sports: SPORTS });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'state', data: state, sports: SPORTS }));

  ws.on('message', raw => {
    try {
      handleAction(JSON.parse(raw));
    } catch (e) {
      console.error('Bad WS message', e.message);
    }
  });
});

function handleAction(action) {
  switch (action.type) {
    case 'updateTeam':
      state[action.team] = { ...state[action.team], ...action.data };
      break;
    case 'updateScore':
      state[action.team].score = Math.max(0, state[action.team].score + action.delta);
      break;
    case 'setScore':
      state[action.team].score = Math.max(0, parseInt(action.value) || 0);
      break;
    case 'updateCards': {
      const key = action.cardType + 'Cards';
      state[action.team][key] = Math.max(0, (state[action.team][key] || 0) + action.delta);
      break;
    }
    case 'clockStart':
      startClock();
      break;
    case 'clockStop':
      stopClock();
      break;
    case 'clockReset':
      stopClock();
      state.clock.elapsed = 0;
      break;
    case 'clockSet':
      state.clock.elapsed = Math.max(0, action.elapsed);
      break;
    case 'setPeriod':
      state.period = action.period;
      break;
    case 'changePeriod':
      stopClock();
      state.period = action.period;
      state.clock.elapsed = Math.max(0, action.elapsed);
      break;
    case 'setPeriodMins':
      state.periodMins = action.value > 0 ? parseFloat(action.value) : null;
      break;
    case 'setSport':
      state.sport = action.sport;
      const cfg = SPORTS[action.sport];
      if (cfg) state.clock.direction = cfg.clockDirection;
      break;
    case 'updateDisplay':
      state.display = { ...state.display, ...action.data };
      break;
    case 'resetScores':
      state.home.score = 0;
      state.away.score = 0;
      state.home.yellowCards = 0;
      state.home.redCards = 0;
      state.away.yellowCards = 0;
      state.away.redCards = 0;
      stopClock();
      state.clock.elapsed = 0;
      state.period = 1;
      break;
    case 'updateBugStyle':
      state.bugStyle = { ...state.bugStyle, ...action.data };
      break;
    case 'updateExternalClock':
      state.externalClock = { ...state.externalClock, ...action.data };
      break;
    case 'updatePosition':
      state.position = { x: action.x, y: action.y };
      break;
    case 'updateScale':
      state.scale = Math.max(0.3, Math.min(3.0, action.scale));
      break;
    case 'fullReset':
      stopClock();
      state = structuredClone(DEFAULT_STATE);
      break;
  }

  saveState();
  broadcastState();
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.team}-logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    cb(null, ok.includes(path.extname(file.originalname).toLowerCase()));
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Setup (first-run password creation) ───────────────────────────────
app.get('/setup', (req, res) => {
  if (getAuthMode() !== 'setup') return res.redirect('/admin.html');
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});
app.post('/setup', (req, res) => {
  if (getAuthMode() !== 'setup') return res.redirect('/admin.html');
  const password = req.body.password?.trim();
  const confirm  = req.body.confirm?.trim();
  if (!password || password.length < 6) return res.redirect('/setup?error=weak');
  if (password !== confirm)             return res.redirect('/setup?error=mismatch');
  const recoveryKey = generateRecoveryKey();
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    hash: hashSecret(password),
    recoveryHash: hashSecret(recoveryKey),
    createdAt: new Date().toISOString(),
  }, null, 2));
  const maxAge = 60 * 60 * 24 * 30;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${signValue('admin')}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
  res.send(recoveryKeyPage(recoveryKey));
});

// ── Forgot password ────────────────────────────────────────────────────
app.get('/forgot', (req, res) => {
  if (getAuthMode() !== 'file') return res.redirect('/login');
  if (verifySignedCookie(parseCookies(req)[COOKIE_NAME])) return res.redirect('/admin.html');
  res.sendFile(path.join(__dirname, 'public', 'forgot.html'));
});
app.post('/forgot', (req, res) => {
  if (getAuthMode() !== 'file') return res.redirect('/login');
  const { recoveryKey, password, confirm } = req.body;
  if (!recoveryKey || !password || password.length < 6) return res.redirect('/forgot?error=1');
  if (password !== confirm)                              return res.redirect('/forgot?error=mismatch');
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const key = recoveryKey.trim().toUpperCase().replace(/[^0-9A-F-]/g, '');
  if (!verifySecret(key, auth.recoveryHash)) return res.redirect('/forgot?error=1');
  auth.hash = hashSecret(password.trim());
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
  const maxAge = 60 * 60 * 24 * 30;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${signValue('admin')}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
  res.redirect('/admin.html');
});

// ── Login / logout routes (public) ────────────────────────────────────
app.get('/login', (req, res) => {
  if (getAuthMode() === 'setup') return res.redirect('/setup');
  if (verifySignedCookie(parseCookies(req)[COOKIE_NAME])) return res.redirect('/admin.html');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.post('/login', (req, res) => {
  const mode = getAuthMode();
  let ok = false;
  if (mode === 'env') {
    ok = req.body.password?.trim() === ADMIN_PASSWORD;
  } else if (mode === 'file') {
    try {
      const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
      ok = verifySecret(req.body.password?.trim() || '', auth.hash);
    } catch { ok = false; }
  }
  if (ok) {
    const maxAge = 60 * 60 * 24 * 30;
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${signValue('admin')}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
    return res.redirect('/admin.html');
  }
  res.redirect('/login?error=1');
});
app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.redirect('/login');
});

// ── Protected routes ───────────────────────────────────────────────────
app.get('/api/auth-enabled', (req, res) => res.json({ enabled: true, mode: getAuthMode() }));
app.get('/admin.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', requireAuth);

// ── Public static (overlay etc.) ──────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/admin.html'));

app.get('/api/state', (req, res) => res.json({ state, sports: SPORTS }));

// ── Profiles ──────────────────────────────────────────────────────────
app.get('/api/profiles', (req, res) => res.json(listProfiles()));

app.post('/api/profiles', (req, res) => {
  const { name, type, includeStyle } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Missing name or type' });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const data = {};

  if (type === 'match' || type === 'full') {
    data.sport = state.sport;
    data.home  = { name: state.home.name, shortName: state.home.shortName, color: state.home.color, logo: state.home.logo };
    data.away  = { name: state.away.name, shortName: state.away.shortName, color: state.away.color, logo: state.away.logo };
  }
  if (type === 'style' || type === 'full' || includeStyle) {
    data.bugStyle = { ...state.bugStyle };
    data.display  = { ...state.display };
    data.position = { ...state.position };
    data.scale    = state.scale;
  }

  const profile = { id, name, type: includeStyle && type === 'match' ? 'match+style' : type, createdAt: new Date().toISOString(), data };
  fs.writeFileSync(path.join(PROFILES_DIR, `${id}.json`), JSON.stringify(profile, null, 2));
  res.json(profile);
});

app.post('/api/profiles/:id/load', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });

  const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = profile.data;

  if (d.sport)    state.sport = d.sport;
  if (d.home)     state.home  = { ...state.home, ...d.home };
  if (d.away)     state.away  = { ...state.away, ...d.away };
  if (d.bugStyle) state.bugStyle = { ...state.bugStyle, ...d.bugStyle };
  if (d.display)  state.display  = { ...state.display,  ...d.display };
  if (d.position) state.position = d.position;
  if (d.scale != null) state.scale = d.scale;

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/profiles/import', (req, res) => {
  const p = req.body;
  if (!p || !p.data || !p.type) return res.status(400).json({ error: 'Invalid profile' });
  const id = p.id || Date.now().toString(36);
  const profile = { ...p, id, createdAt: p.createdAt || new Date().toISOString() };
  fs.writeFileSync(path.join(PROFILES_DIR, `${id}.json`), JSON.stringify(profile, null, 2));
  res.json(profile);
});

app.put('/api/profiles/:id', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });

  const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = {};

  if (profile.type === 'match' || profile.type === 'full' || profile.type === 'match+style') {
    data.sport = state.sport;
    data.home  = { name: state.home.name, shortName: state.home.shortName, color: state.home.color, logo: state.home.logo };
    data.away  = { name: state.away.name, shortName: state.away.shortName, color: state.away.color, logo: state.away.logo };
  }
  if (profile.type === 'style' || profile.type === 'full' || profile.type === 'match+style') {
    data.bugStyle = { ...state.bugStyle };
    data.display  = { ...state.display };
    data.position = { ...state.position };
    data.scale    = state.scale;
  }

  profile.data = data;
  fs.writeFileSync(file, JSON.stringify(profile, null, 2));
  res.json(profile);
});

app.delete('/api/profiles/:id', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

app.post('/api/upload/:team', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid file uploaded' });
  const logoPath = `/uploads/${req.file.filename}`;
  state[req.params.team].logo = logoPath;
  saveState();
  broadcastState();
  res.json({ logo: logoPath });
});

app.delete('/api/upload/:team', (req, res) => {
  const team = req.params.team;
  if (state[team] && state[team].logo) {
    const filePath = path.join(UPLOADS_DIR, path.basename(state[team].logo));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    state[team].logo = null;
    saveState();
    broadcastState();
  }
  res.json({ ok: true });
});

server.listen(PORT, () => {
  console.log(`\n  Score Bug Server running`);
  console.log(`  Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`  Overlay: http://localhost:${PORT}/overlay.html`);
  console.log(`  Port:    ${PORT}\n`);
});
