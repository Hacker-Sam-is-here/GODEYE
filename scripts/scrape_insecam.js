// ============================================================
//  GODEYE — Insecam Scraper v3 (robust, full coverage)
//  Run: "C:\Program Files\nodejs\node.exe" scripts/scrape_insecam.js
//  Output: data/insecam_cameras.json
//
//  Strategy:
//  1. Fetch listing pages per country — extract IDs + stream URLs inline
//  2. For coordinates: try detail page first, then IP-API geolocation,
//     then country centroid fallback — never silently drop a camera
// ============================================================
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5', 'Accept': 'text/html,*/*' };
const OUT_DIR  = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'insecam_cameras.json');

// Country centroid fallbacks — used when a camera has no GPS data
const COUNTRY_CENTROIDS = {
  US:{lat:39.5,lng:-98.35}, JP:{lat:36.2,lng:138.25}, IT:{lat:41.87,lng:12.56},
  DE:{lat:51.16,lng:10.45}, RU:{lat:61.52,lng:105.31}, AT:{lat:47.51,lng:14.55},
  CZ:{lat:49.81,lng:15.47}, FR:{lat:46.22,lng:2.21},   KR:{lat:35.90,lng:127.76},
  CH:{lat:46.81,lng:8.22},  NO:{lat:60.47,lng:8.46},   RO:{lat:45.94,lng:24.96},
  TW:{lat:23.69,lng:120.96},CA:{lat:56.13,lng:-106.34},ES:{lat:40.46,lng:-3.74},
  SE:{lat:60.12,lng:18.64}, NL:{lat:52.13,lng:5.29},   PL:{lat:51.91,lng:19.14},
  GB:{lat:55.37,lng:-3.43}, UA:{lat:48.37,lng:31.16},  IN:{lat:20.59,lng:78.96},
  BG:{lat:42.73,lng:25.48}, DK:{lat:56.26,lng:9.50},   SK:{lat:48.66,lng:19.69},
  FI:{lat:61.92,lng:25.74}, BE:{lat:50.50,lng:4.46},   HU:{lat:47.16,lng:19.50},
  ZA:{lat:-30.55,lng:22.93},TR:{lat:38.96,lng:35.24},  GR:{lat:39.07,lng:21.82},
  BA:{lat:43.91,lng:17.67}, TH:{lat:15.87,lng:100.99}, EG:{lat:26.82,lng:30.80},
  NZ:{lat:-40.90,lng:174.88},IE:{lat:53.41,lng:-8.24}, BR:{lat:-14.23,lng:-51.92},
  AU:{lat:-25.27,lng:133.77},ID:{lat:-0.78,lng:113.92},CL:{lat:-35.67,lng:-71.54},
  AR:{lat:-38.41,lng:-63.61},CN:{lat:35.86,lng:104.19},LT:{lat:55.16,lng:23.88},
  MX:{lat:23.63,lng:-102.55},KZ:{lat:48.01,lng:66.92}, MD:{lat:47.41,lng:28.36},
  EE:{lat:58.59,lng:25.01}, VN:{lat:14.05,lng:108.27}, FO:{lat:61.89,lng:-6.91},
  HN:{lat:15.19,lng:-86.24},HK:{lat:22.39,lng:114.10}, IL:{lat:31.04,lng:34.85},
  BY:{lat:53.70,lng:27.95}, SI:{lat:46.15,lng:14.99},  PE:{lat:-9.18,lng:-75.01},
  GU:{lat:13.44,lng:144.79},PA:{lat:8.53,lng:-80.78},  BD:{lat:23.68,lng:90.35},
  AM:{lat:40.06,lng:45.03}, SG:{lat:1.35,lng:103.81},  NI:{lat:12.86,lng:-85.20},
  CO:{lat:4.57,lng:-74.29}, PT:{lat:39.39,lng:-8.22},  HR:{lat:45.10,lng:15.20},
  RS:{lat:44.01,lng:21.00}, LV:{lat:56.87,lng:24.60},
};

// ── HTTP helpers ───────────────────────────────────────────────
function get(url, retries = 3) {
  return new Promise(resolve => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    let attempt = 0;
    function try_() {
      attempt++;
      try {
        const req = lib.get(url, { headers: HEADERS, timeout: 15000 }, res => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const loc = res.headers.location;
            resolve(loc ? get(loc.startsWith('http') ? loc : `http://insecam.org${loc}`, retries) : '');
            return;
          }
          let d = ''; res.setEncoding('utf8');
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
          res.on('error', () => attempt < retries ? setTimeout(try_, 800 * attempt) : resolve(''));
        });
        req.on('error', () => attempt < retries ? setTimeout(try_, 800 * attempt) : resolve(''));
        req.on('timeout', () => { req.destroy(); attempt < retries ? setTimeout(try_, 800 * attempt) : resolve(''); });
      } catch(e) { resolve(''); }
    }
    try_();
  });
}

// ── Parse stream URL from listing page img tags ────────────────
// Listing page has: <img ... src="http://IP:PORT/path" ...> for each camera
function parseListingStreams(html) {
  // Map of cameraId -> streamUrl extracted directly from the listing HTML
  const result = {};
  // Pattern 1: href="/en/view/ID/" ... src="http://..."
  const blockRe = /href="\/en\/view\/(\d+)\/"[\s\S]*?<img[^>]+src="(http:\/\/[^"]+)"/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    result[m[1]] = m[2].replace(/&amp;/g, '&');
  }
  // Pattern 2: data-src or image0 src in preview blocks
  const altRe = /\/en\/view\/(\d+)\/[^>]*>[\s\S]{0,500}?src="(http:\/\/\d+\.\d+\.\d+\.\d+[^"]+)"/g;
  while ((m = altRe.exec(html)) !== null) {
    if (!result[m[1]]) result[m[1]] = m[2].replace(/&amp;/g, '&');
  }
  return result;
}

// ── Parse coordinates from camera detail page ──────────────────
function parseCoords(html) {
  // Try multiple patterns Insecam uses
  // Pattern 1: "Latitude:\n ... camera-details__cell"> VALUE
  const patterns = [
    { lat: /Latitude:[\s\S]{0,300}?camera-details__cell">([0-9\-\.]+)/, lng: /Longitude:[\s\S]{0,300}?camera-details__cell">([0-9\-\.]+)/ },
    // Pattern 2: data-lat / data-lng attributes
    { lat: /data-lat="([0-9\-\.]+)"/, lng: /data-lng="([0-9\-\.]+)"/ },
    // Pattern 3: Google Maps link
    { lat: /maps\.google\.com[^"]*?q=([0-9\-\.]+),([0-9\-\.]+)/, combined: true },
    // Pattern 4: "lat":XX.XX in JSON blob
    { lat: /"lat"\s*:\s*([0-9\-\.]+)/, lng: /"lng"\s*:\s*([0-9\-\.]+)/ },
    { lat: /"latitude"\s*:\s*([0-9\-\.]+)/, lng: /"longitude"\s*:\s*([0-9\-\.]+)/ },
  ];

  for (const p of patterns) {
    if (p.combined) {
      const m = html.match(p.lat);
      if (m) {
        const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) return { lat, lng };
      }
    } else {
      const ml = html.match(p.lat), mn = html.match(p.lng);
      if (ml && mn) {
        const lat = parseFloat(ml[1]), lng = parseFloat(mn[1]);
        if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) return { lat, lng };
      }
    }
  }
  return null;
}

// ── Parse stream URL from detail page (fallback) ───────────────
function parseDetailStream(html) {
  const patterns = [
    /id="image0"[\s\S]*?src="(http[^"]+)"/,
    /id="image0"\s*\n\s*src="(http[^"]+)"/,
    /<img[^>]+id="image0"[^>]*src="(http[^"]+)"/,
    /src="(http:\/\/\d+\.\d+\.\d+\.\d+[^"]+)"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/&amp;/g, '&');
  }
  return null;
}

// ── Parse metadata from detail page ───────────────────────────
function parseMeta(html, label) {
  // Try linked value first (<a>VALUE</a>), then plain text
  const marker = label;
  const i = html.indexOf(marker);
  if (i === -1) return '';
  const snippet = html.slice(i, i + 500);
  const aMatch = snippet.match(/<a[^>]*>([^<]+)<\/a>/);
  if (aMatch) return aMatch[1].trim();
  const cellMatch = snippet.match(/camera-details__cell">([^<]+)</);
  if (cellMatch) return cellMatch[1].trim();
  return '';
}

// ── IP Geolocation fallback via ip-api.com ────────────────────
const _ipCache = {};
async function geolocateIP(streamUrl) {
  try {
    const ip = streamUrl.match(/https?:\/\/(\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (!ip) return null;
    if (_ipCache[ip]) return _ipCache[ip];
    const data = JSON.parse(await get(`http://ip-api.com/json/${ip}?fields=status,lat,lon,country,city,regionName`));
    if (data.status === 'success' && data.lat && data.lon) {
      const result = { lat: data.lat, lng: data.lon, country: data.country, city: data.city, region: data.regionName };
      _ipCache[ip] = result;
      return result;
    }
  } catch(e) {}
  return null;
}

// ── Batch execution ────────────────────────────────────────────
async function batchMap(arr, fn, batchSize = 6) {
  const results = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    const res = await Promise.all(arr.slice(i, i + batchSize).map(fn));
    results.push(...res.filter(Boolean));
  }
  return results;
}

// ── Scrape one country ─────────────────────────────────────────
const cameras = [];

async function scrapeCountry(cc) {
  process.stdout.write(`[${cc}] Fetching page count... `);
  const first = await get(`http://insecam.org/en/bycountry/${cc}/?page=1`);
  if (!first || first.length < 500) { console.log('no response'); return; }

  let pages = 1;
  try { pages = parseInt(first.split('pagenavigator("?page=", ')[1]?.split(',')[0], 10) || 1; } catch(e) {}
  console.log(`${pages} page(s)`);

  // Step 1: collect IDs + stream URLs from all listing pages
  const pageHTMLs = [first, ...await batchMap(
    Array.from({ length: pages - 1 }, (_, i) => i + 2),
    p => get(`http://insecam.org/en/bycountry/${cc}/?page=${p}`),
    5
  )];

  // Extract all camera IDs from listing
  const allIds = new Set();
  for (const html of pageHTMLs) {
    const re = /\/en\/view\/(\d+)\//g; let m;
    while ((m = re.exec(html)) !== null) allIds.add(m[1]);
  }

  // Pre-extract stream URLs from listing pages (much faster than detail pages)
  const listingStreams = {};
  for (const html of pageHTMLs) Object.assign(listingStreams, parseListingStreams(html));

  const centroid = COUNTRY_CENTROIDS[cc];
  console.log(`[${cc}] ${allIds.size} IDs found (${Object.keys(listingStreams).length} streams from listing)`);

  // Step 2: for each camera, get coords from detail page + stream fallback
  const cams = await batchMap([...allIds], async id => {
    try {
      const stream = listingStreams[id]; // already have from listing
      const detailHtml = await get(`http://insecam.org/en/view/${id}/`);

      let lat, lng, country = '', city = '', region = '', manufacturer = '';
      let resolvedStream = stream;

      if (detailHtml) {
        const coords = parseCoords(detailHtml);
        if (coords) { lat = coords.lat; lng = coords.lng; }
        country      = parseMeta(detailHtml, 'Country:');
        city         = parseMeta(detailHtml, 'City:');
        region       = parseMeta(detailHtml, 'Region:');
        manufacturer = parseMeta(detailHtml, 'Manufacturer:');
        if (!resolvedStream) resolvedStream = parseDetailStream(detailHtml);
      }

      if (!resolvedStream) return null; // no stream at all → skip

      // Coordinate fallback chain: detail page → IP geolocation → country centroid
      if (!lat || !lng || (lat === 0 && lng === 0)) {
        const geo = await geolocateIP(resolvedStream);
        if (geo) {
          lat = geo.lat; lng = geo.lon || geo.lng;
          if (!country) country = geo.country;
          if (!city)    city    = geo.city;
          if (!region)  region  = geo.region;
        } else if (centroid) {
          // Scatter slightly around centroid so cameras don't stack
          lat = centroid.lat + (Math.random() - 0.5) * 3;
          lng = centroid.lng + (Math.random() - 0.5) * 3;
        } else {
          return null; // truly no coordinates
        }
      }

      process.stdout.write(`  ✓${city ? ' ' + city : ''}\n`);
      return { id, country, city, region, manufacturer, lat, lng, stream: resolvedStream };
    } catch(e) { return null; }
  }, 5);

  cameras.push(...cams);
  console.log(`[${cc}] +${cams.length} cameras | Total: ${cameras.length}`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
}

// ── Fetch available country list ───────────────────────────────
async function getCountryCodes() {
  try {
    const data = JSON.parse(await get('http://insecam.org/en/jsoncountries/'));
    return Object.entries(data.countries)
      .filter(([cc]) => cc !== '-' && cc.trim())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cc, info]) => ({ cc, count: info.count, name: info.country }));
  } catch(e) {
    console.warn('Country API failed, using built-in list');
    return Object.keys(COUNTRY_CENTROIDS).map(cc => ({ cc, count: 1, name: cc }));
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching country list from Insecam...');
  const countries = await getCountryCodes();
  console.log(`Found ${countries.length} countries:`, countries.map(c => `${c.cc}(${c.count})`).join(' '));

  for (const { cc } of countries) {
    try { await scrapeCountry(cc); } catch(e) { console.warn(`[${cc}] Error: ${e.message}`); }
    await new Promise(r => setTimeout(r, 500));
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
  console.log(`\n✅ Complete: ${cameras.length} cameras from ${countries.length} countries → ${OUT_FILE}`);
}

main().catch(console.error);
