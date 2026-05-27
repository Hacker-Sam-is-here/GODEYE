// ============================================================
//  GODEYE — Insecam Scraper v4 (correct HTML parsing)
//  Run: "C:\Program Files\nodejs\node.exe" scripts/scrape_insecam.js
//  Output: data/insecam_cameras.json
// ============================================================
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5' };
const OUT_DIR  = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'insecam_cameras.json');

const COUNTRY_CENTROIDS = {
  US:{lat:39.5,lng:-98.35},   JP:{lat:36.2,lng:138.25},  IT:{lat:41.87,lng:12.56},
  DE:{lat:51.16,lng:10.45},   RU:{lat:61.52,lng:105.31}, AT:{lat:47.51,lng:14.55},
  CZ:{lat:49.81,lng:15.47},   FR:{lat:46.22,lng:2.21},   KR:{lat:35.90,lng:127.76},
  CH:{lat:46.81,lng:8.22},    NO:{lat:60.47,lng:8.46},   RO:{lat:45.94,lng:24.96},
  TW:{lat:23.69,lng:120.96},  CA:{lat:56.13,lng:-106.34},ES:{lat:40.46,lng:-3.74},
  SE:{lat:60.12,lng:18.64},   NL:{lat:52.13,lng:5.29},   PL:{lat:51.91,lng:19.14},
  GB:{lat:55.37,lng:-3.43},   UA:{lat:48.37,lng:31.16},  IN:{lat:20.59,lng:78.96},
  BG:{lat:42.73,lng:25.48},   DK:{lat:56.26,lng:9.50},   SK:{lat:48.66,lng:19.69},
  FI:{lat:61.92,lng:25.74},   BE:{lat:50.50,lng:4.46},   HU:{lat:47.16,lng:19.50},
  ZA:{lat:-30.55,lng:22.93},  TR:{lat:38.96,lng:35.24},  GR:{lat:39.07,lng:21.82},
  BA:{lat:43.91,lng:17.67},   TH:{lat:15.87,lng:100.99}, EG:{lat:26.82,lng:30.80},
  NZ:{lat:-40.90,lng:174.88}, IE:{lat:53.41,lng:-8.24},  BR:{lat:-14.23,lng:-51.92},
  AU:{lat:-25.27,lng:133.77}, ID:{lat:-0.78,lng:113.92}, CL:{lat:-35.67,lng:-71.54},
  AR:{lat:-38.41,lng:-63.61}, CN:{lat:35.86,lng:104.19}, LT:{lat:55.16,lng:23.88},
  MX:{lat:23.63,lng:-102.55}, KZ:{lat:48.01,lng:66.92},  MD:{lat:47.41,lng:28.36},
  EE:{lat:58.59,lng:25.01},   VN:{lat:14.05,lng:108.27}, FO:{lat:61.89,lng:-6.91},
  HN:{lat:15.19,lng:-86.24},  HK:{lat:22.39,lng:114.10}, IL:{lat:31.04,lng:34.85},
  BY:{lat:53.70,lng:27.95},   SI:{lat:46.15,lng:14.99},  PE:{lat:-9.18,lng:-75.01},
  GU:{lat:13.44,lng:144.79},  PA:{lat:8.53,lng:-80.78},  BD:{lat:23.68,lng:90.35},
  AM:{lat:40.06,lng:45.03},   SG:{lat:1.35,lng:103.81},  NI:{lat:12.86,lng:-85.20},
  CO:{lat:4.57,lng:-74.29},   PT:{lat:39.39,lng:-8.22},  HR:{lat:45.10,lng:15.20},
  RS:{lat:44.01,lng:21.00},   LV:{lat:56.87,lng:24.60},
};

// ── HTTP get ───────────────────────────────────────────────────
function get(url, retries = 3) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    let attempt = 0;
    function try_() {
      attempt++;
      try {
        const req = lib.get(url, { headers: HEADERS, timeout: 15000 }, res => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const loc = res.headers.location || '';
            resolve(get(loc.startsWith('http') ? loc : `http://insecam.org${loc}`, retries));
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

// ── Parse cameras from listing page ───────────────────────────
// Returns array of { id, stream } — stream extracted from img src on listing page
function parseListingPage(html) {
  const results = [];
  // The listing page HTML structure (confirmed by diagnostic):
  //   <a ... href="/en/view/ID/" ...>
  //     <img id="imageID" ... src="http://IP:PORT/path" ... />
  // Extract all image tags with id="imageXXXXX"
  const imgRe = /id="image(\d+)"[^>]*src="(http[^"]+)"/g;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    results.push({ id: m[1], stream: m[2].replace(/&amp;/g, '&') });
  }
  return results;
}

// ── Parse coordinates from detail page ────────────────────────
// Confirmed HTML structure:
//   <div class="camera-details__cell">Latitude:</div>
//   <div class="camera-details__cell">44.483400</div>
function parseCoords(html) {
  // Split on camera-details__cell and find the value after the label
  const cells = html.split('camera-details__cell">');
  for (let i = 0; i < cells.length - 1; i++) {
    const cell = cells[i];
    if (cell.includes('Latitude:')) {
      const valRaw = cells[i + 1].split('<')[0].trim();
      const lat = parseFloat(valRaw);
      // Find longitude in next pair
      for (let j = i + 1; j < cells.length - 1; j++) {
        if (cells[j].includes('Longitude:')) {
          const lngRaw = cells[j + 1].split('<')[0].trim();
          const lng = parseFloat(lngRaw);
          if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
            return { lat, lng };
          }
          break;
        }
      }
    }
  }
  return null;
}

// ── Parse metadata (Country, City, etc.) ──────────────────────
function parseMeta(html, label) {
  const cells = html.split('camera-details__cell">');
  for (let i = 0; i < cells.length - 1; i++) {
    if (cells[i].includes(label)) {
      // Value might be plain text or wrapped in <a>
      const rawVal = cells[i + 1].split('</div>')[0];
      const aMatch = rawVal.match(/<a[^>]*>([^<]+)<\/a>/);
      if (aMatch) return aMatch[1].trim();
      return rawVal.replace(/<[^>]+>/g, '').trim();
    }
  }
  return '';
}

// ── IP geolocation cache ───────────────────────────────────────
const _ipCache = {};
async function geoIP(streamUrl) {
  const ip = streamUrl.match(/https?:\/\/(\d+\.\d+\.\d+\.\d+)/)?.[1];
  if (!ip) return null;
  if (_ipCache[ip]) return _ipCache[ip];
  try {
    const data = JSON.parse(await get(`http://ip-api.com/json/${ip}?fields=status,lat,lon,country,city,regionName`));
    if (data.status === 'success') {
      const r = { lat: data.lat, lng: data.lon, country: data.country, city: data.city };
      _ipCache[ip] = r;
      return r;
    }
  } catch(e) {}
  return null;
}

// ── Batch runner ───────────────────────────────────────────────
async function batchMap(arr, fn, size = 6) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    const res = await Promise.all(arr.slice(i, i + size).map(fn));
    out.push(...res.filter(Boolean));
  }
  return out;
}

// ── Scrape one country ─────────────────────────────────────────
const cameras = [];

async function scrapeCountry(cc) {
  process.stdout.write(`[${cc}] `);
  const first = await get(`http://insecam.org/en/bycountry/${cc}/?page=1`);
  if (!first || first.length < 500) { console.log('no response'); return; }

  let pages = 1;
  // Try both pagenavigator patterns
  const pm = first.match(/pagenavigator\([^,]+,\s*(\d+)/) || first.match(/page=(\d+)[^0-9].*?pagenavigator/);
  if (pm) pages = parseInt(pm[1], 10) || 1;
  process.stdout.write(`${pages}p `);

  // Collect all listing pages
  const htmlPages = [first];
  if (pages > 1) {
    const rest = await batchMap(
      Array.from({ length: pages - 1 }, (_, i) => i + 2),
      p => get(`http://insecam.org/en/bycountry/${cc}/?page=${p}`),
      5
    );
    htmlPages.push(...rest.filter(h => h && h.length > 500));
  }

  // Extract camera IDs + stream URLs from listing pages
  const seen = new Set();
  const entries = []; // [{id, stream}]
  for (const html of htmlPages) {
    for (const entry of parseListingPage(html)) {
      if (!seen.has(entry.id)) { seen.add(entry.id); entries.push(entry); }
    }
  }
  process.stdout.write(`${entries.length}cams `);

  const centroid = COUNTRY_CENTROIDS[cc];

  // For each camera: get detail page for coords + metadata
  const cams = await batchMap(entries, async ({ id, stream }) => {
    try {
      const detail = await get(`http://insecam.org/en/view/${id}/`);
      let lat, lng, country = '', city = '', manufacturer = '';

      if (detail && detail.length > 1000) {
        const coords = parseCoords(detail);
        if (coords) { lat = coords.lat; lng = coords.lng; }
        country      = parseMeta(detail, 'Country:');
        city         = parseMeta(detail, 'City:');
        manufacturer = parseMeta(detail, 'Manufacturer:');
      }

      // Coordinate fallback chain
      if (!lat || !lng) {
        const geo = await geoIP(stream);
        if (geo) {
          lat = geo.lat; lng = geo.lng;
          if (!country) country = geo.country;
          if (!city)    city    = geo.city;
        } else if (centroid) {
          lat = centroid.lat + (Math.random() - 0.5) * 4;
          lng = centroid.lng + (Math.random() - 0.5) * 6;
        } else return null;
      }

      return { id, country, city, manufacturer, lat, lng, stream };
    } catch(e) { return null; }
  }, 6);

  cameras.push(...cams);
  console.log(`→ +${cams.length} | Total: ${cameras.length}`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
}

// ── Country list ───────────────────────────────────────────────
async function getCountries() {
  try {
    const data = JSON.parse(await get('http://insecam.org/en/jsoncountries/'));
    return Object.entries(data.countries)
      .filter(([cc]) => cc.trim() && cc !== '-')
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cc, info]) => ({ cc, count: info.count }));
  } catch(e) {
    return Object.keys(COUNTRY_CENTROIDS).map(cc => ({ cc, count: 1 }));
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const countries = await getCountries();
  console.log(`Scraping ${countries.length} countries...\n`);
  for (const { cc } of countries) {
    try { await scrapeCountry(cc); } catch(e) { console.warn(`[${cc}] ERR: ${e.message}`); }
    await new Promise(r => setTimeout(r, 400));
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
  console.log(`\n✅ ${cameras.length} cameras → ${OUT_FILE}`);
}

main().catch(console.error);
