// ============================================================
//  GODEYE — Render Server
//  Serves the static frontend + proxies all keyed API calls
//  API keys live ONLY in environment variables — never in JS
// ============================================================
const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Keys from environment variables (set in Render dashboard) ─
const KEYS = {
  AISSTREAM:  process.env.AISSTREAM_KEY   || '',
  ACLED_EMAIL: process.env.ACLED_EMAIL    || '',
  ACLED_PASS:  process.env.ACLED_PASSWORD || '',
  FIRMS:       process.env.FIRMS_API_KEY  || '',
  N2YO:        process.env.N2YO_API_KEY   || '',
  OSINT_PRIMARY:  process.env.OSINT_PRIMARY_URL  || 'https://anuapi.netlify.app/.netlify/functions/api',
  OSINT_FALLBACK: process.env.OSINT_FALLBACK_URL || 'https://api.b77bf911.workers.dev',
};

app.use(cors());
app.use(express.json());

// ── 1. Serve static frontend files ───────────────────────────
app.use(express.static(path.join(__dirname)));

// ── 2. Config endpoint — sends keys to frontend at runtime ───
//       ONLY sends what's needed, never raw secrets
app.get('/api/config', (req, res) => {
  res.json({
    // No real keys returned — features enabled/disabled based on env
    HAS_AISSTREAM:  !!KEYS.AISSTREAM,
    HAS_ACLED:      !!KEYS.ACLED_EMAIL,
    HAS_FIRMS:      !!KEYS.FIRMS,
    HAS_N2YO:       !!KEYS.N2YO,
    OSINT_PRIMARY:  KEYS.OSINT_PRIMARY,
    OSINT_FALLBACK: KEYS.OSINT_FALLBACK,
  });
});

// ── 3. AIS Stream proxy (WebSocket key injected server-side) ─
app.get('/api/ais-key', (req, res) => {
  if (!KEYS.AISSTREAM) return res.status(503).json({ error: 'AIS not configured' });
  // Return a one-time token reference — client uses this to connect
  res.json({ key: KEYS.AISSTREAM });
});

// ── 4. ACLED conflicts proxy ─────────────────────────────────
app.get('/api/acled', async (req, res) => {
  if (!KEYS.ACLED_EMAIL) return res.status(503).json({ error: 'ACLED not configured' });
  try {
    const { limit = 50, page = 1 } = req.query;
    const url = `https://api.acleddata.com/acled/read/?key=${KEYS.ACLED_PASS}&email=${KEYS.ACLED_EMAIL}&limit=${limit}&page=${page}&fields=event_date|event_type|sub_event_type|actor1|actor2|country|location|latitude|longitude|fatalities|notes&event_date_where=BETWEEN&event_date=2024-01-01|2099-01-01`;
    const r = await fetch(url, { headers: { 'User-Agent': 'GODEYE/1.0' }, signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 5. NASA FIRMS fires proxy ─────────────────────────────────
app.get('/api/firms', async (req, res) => {
  if (!KEYS.FIRMS) return res.status(503).json({ error: 'FIRMS not configured' });
  try {
    const { area = 'world', days = 1 } = req.query;
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEYS.FIRMS}/VIIRS_SNPP_NRT/${area}/${days}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    res.setHeader('Content-Type', 'text/csv');
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 6. N2YO satellite proxy ───────────────────────────────────
app.get('/api/n2yo/:endpoint', async (req, res) => {
  if (!KEYS.N2YO) return res.status(503).json({ error: 'N2YO not configured' });
  try {
    const { endpoint } = req.params;
    const qs = new URLSearchParams(req.query).toString();
    const url = `https://api.n2yo.com/rest/v1/satellite/${endpoint}?apiKey=${KEYS.N2YO}${qs ? '&' + qs : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 7. Generic CORS proxy (for keyless APIs that block browsers)
//       Allowlist to prevent open-proxy abuse
const PROXY_ALLOWLIST = [
  'earthquake.usgs.gov',
  'eonet.gsfc.nasa.gov',
  'api.gdeltproject.org',
  'opensky-network.org',
  'api.adsb.lol',
  'insecam.org',
  'aisstream.io',
  'saurav.tech',
  'api.acleddata.com',
];

app.get('/api/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'Missing url param' });

  let hostname;
  try { hostname = new URL(target).hostname; } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const allowed = PROXY_ALLOWLIST.some(h => hostname === h || hostname.endsWith('.' + h));
  if (!allowed) return res.status(403).json({ error: `Host not allowlisted: ${hostname}` });

  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'GODEYE/1.0 Geospatial Intelligence Platform' },
      signal: AbortSignal.timeout(15000),
    });
    const ct = r.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = await r.buffer();
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 8. OSINT lookup proxy ─────────────────────────────────────
app.get('/api/osint', async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const base = KEYS.OSINT_PRIMARY;
    const url  = `${base}/${encodeURIComponent(type || 'search')}?q=${encodeURIComponent(q)}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    // Fallback
    try {
      const url2 = `${KEYS.OSINT_FALLBACK}/${encodeURIComponent(type || 'search')}?q=${encodeURIComponent(q)}`;
      const r2   = await fetch(url2, { signal: AbortSignal.timeout(20000) });
      res.json(await r2.json());
    } catch (e2) {
      res.status(500).json({ error: e2.message });
    }
  }
});
});

// ── Camera stream proxy — solves mixed-content block ─────────
//    Browser on https:// can't load http:// camera images directly.
//    This endpoint fetches the frame server-side and relays it.
//    GET /api/cam-proxy?url=http://1.2.3.4:8080/image.jpg
const CAM_ALLOWED_PATTERNS = [
  /^\d+\.\d+\.\d+\.\d+(:\d+)?$/, // bare IP[:port]
  /insecam\.org$/,
  /webcams\.nyctmc\.org$/,
  /images\.wsdot\.wa\.gov$/,
  /jamcams\.tfl\.gov\.uk$/,
  /images\.data\.gov\.sg$/,
];

app.get('/api/cam-proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).end('Missing url');

  let hostname;
  try { hostname = new URL(target).hostname; } catch { return res.status(400).end('Invalid URL'); }

  const allowed = CAM_ALLOWED_PATTERNS.some(p => p.test(hostname));
  if (!allowed) return res.status(403).end(`Host not allowed: ${hostname}`);

  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'GODEYE/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(r.status).end();
    const ct = r.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = await r.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (e) {
    res.status(504).end('Camera timeout');
  }
});

// ── Fallback: serve index.html for any unmatched route ────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Server startup ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛰 GODEYE server running on port ${PORT}`);
  console.log(`   AIS:   ${KEYS.AISSTREAM   ? '✓' : '✗ not set'}`);
  console.log(`   ACLED: ${KEYS.ACLED_EMAIL ? '✓' : '✗ not set'}`);
  console.log(`   FIRMS: ${KEYS.FIRMS       ? '✓' : '✗ not set'}`);
  console.log(`   N2YO:  ${KEYS.N2YO        ? '✓' : '✗ not set'}`);

  _startSelfPing();
  _startCCTVScheduler();
});

// ═══════════════════════════════════════════════════════════════
//  SELF-PING — keeps Render free tier awake
//  Pings /api/config every 14 minutes (under the 15-min sleep threshold)
// ═══════════════════════════════════════════════════════════════
function _startSelfPing() {
  // Render injects RENDER_EXTERNAL_URL automatically — no manual config needed
  const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

  if (!process.env.RENDER_EXTERNAL_URL) {
    console.log('   Self-ping: skipped (not on Render — local dev mode)');
    return;
  }

  console.log(`   Self-ping: active → ${selfUrl}/api/config every 14 min`);

  setInterval(async () => {
    try {
      const r = await fetch(`${selfUrl}/api/config`, { signal: AbortSignal.timeout(10000) });
      console.log(`[PING] ✓ ${new Date().toISOString()} — status ${r.status}`);
    } catch (e) {
      console.warn(`[PING] ✗ Failed: ${e.message}`);
    }
  }, PING_INTERVAL_MS);
}

// ═══════════════════════════════════════════════════════════════
//  CCTV AUTO-SCRAPER — regenerates insecam_cameras.json every 10 min
//  Runs scrape_insecam.js as a child process in the background
// ═══════════════════════════════════════════════════════════════
const { spawn } = require('child_process');
const fs = require('fs');

let _cctvLastRun   = null;
let _cctvRunning   = false;
let _cctvCameraCount = 0;

function _runScraper() {
  if (_cctvRunning) {
    console.log('[CCTV] Scraper already running — skipping cycle');
    return;
  }
  _cctvRunning = true;
  console.log(`[CCTV] Starting scrape at ${new Date().toISOString()}`);

  const scraper = spawn(process.execPath, [
    path.join(__dirname, 'scripts', 'scrape_insecam.js')
  ], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  scraper.stdout.on('data', d => {
    const line = d.toString().trim();
    if (line.includes('Total:') || line.includes('✅')) console.log('[CCTV]', line);
  });

  scraper.stderr.on('data', d => console.warn('[CCTV ERR]', d.toString().trim()));

  scraper.on('close', code => {
    _cctvRunning = false;
    _cctvLastRun = new Date();
    if (code === 0) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'insecam_cameras.json'), 'utf8'));
        _cctvCameraCount = Array.isArray(data) ? data.length : 0;
        console.log(`[CCTV] ✅ Done — ${_cctvCameraCount} cameras | ${_cctvLastRun.toISOString()}`);
      } catch (e) {
        console.warn('[CCTV] Could not read output file:', e.message);
      }
    } else {
      console.warn(`[CCTV] ✗ Scraper exited with code ${code}`);
    }
  });
}

// Expose scrape status for the frontend
app.get('/api/cctv/status', (req, res) => {
  res.json({
    lastRun:     _cctvLastRun,
    running:     _cctvRunning,
    cameraCount: _cctvCameraCount,
  });
});

// Manual trigger endpoint (useful for testing)
app.post('/api/cctv/refresh', (req, res) => {
  if (_cctvRunning) return res.json({ status: 'already_running' });
  _runScraper();
  res.json({ status: 'started' });
});

function _startCCTVScheduler() {
  const CCTV_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  // Run immediately on startup, then every 10 min
  console.log('   CCTV scraper: scheduled every 10 minutes');
  _runScraper();
  setInterval(_runScraper, CCTV_INTERVAL_MS);
}

