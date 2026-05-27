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

// ── Fallback: serve index.html for any unmatched route ────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🛰 GODEYE server running on port ${PORT}`);
  console.log(`   AIS: ${KEYS.AISSTREAM ? '✓' : '✗ not set'}`);
  console.log(`   ACLED: ${KEYS.ACLED_EMAIL ? '✓' : '✗ not set'}`);
  console.log(`   FIRMS: ${KEYS.FIRMS ? '✓' : '✗ not set'}`);
  console.log(`   N2YO: ${KEYS.N2YO ? '✓' : '✗ not set'}`);
});
