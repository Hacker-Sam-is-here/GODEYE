// ============================================================
//  GODEYE — SUPER SCRAPER
//  Exhaustively collects every camera from insecam.org via:
//    1. All countries (all pages)
//    2. All camera types/manufacturers (all pages)
//    3. "New cameras" listing
//  Deduplicates by ID, resolves coordinates via detail page
//  → IP geolocation → country centroid fallback
//  Output: data/insecam_cameras.json + timestamped backup
//
//  Run: node scripts/super_scrape.js
// ============================================================
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5' };
const OUT_DIR   = path.join(__dirname, '..', 'data');
const OUT_FILE  = path.join(OUT_DIR, 'insecam_cameras.json');
const BACKUP_DIR = path.join(OUT_DIR, 'backups');

// ── Country centroids ──────────────────────────────────────────
const CENTROIDS = {
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
  RS:{lat:44.01,lng:21.00},   LV:{lat:56.87,lng:24.60},  IR:{lat:32.42,lng:53.68},
  LU:{lat:49.81,lng:6.13},    MK:{lat:41.60,lng:21.74},  MT:{lat:35.93,lng:14.37},
  AL:{lat:41.15,lng:20.17},   CY:{lat:35.12,lng:33.43},  GE:{lat:42.31,lng:43.35},
};

// ── HTTP ───────────────────────────────────────────────────────
function get(url, retries = 3) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    let attempt = 0;
    function try_() {
      attempt++;
      try {
        const req = lib.get(url, { headers: HEADERS, timeout: 15000 }, res => {
          if ([301,302].includes(res.statusCode)) {
            const loc = res.headers.location || '';
            resolve(get(loc.startsWith('http') ? loc : `http://insecam.org${loc}`, retries));
            return;
          }
          let d = ''; res.setEncoding('utf8');
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
          res.on('error', () => attempt < retries ? setTimeout(try_, 1000 * attempt) : resolve(''));
        });
        req.on('error', () => attempt < retries ? setTimeout(try_, 1000 * attempt) : resolve(''));
        req.on('timeout', () => { req.destroy(); attempt < retries ? setTimeout(try_, 1000 * attempt) : resolve(''); });
      } catch(e) { resolve(''); }
    }
    try_();
  });
}

// ── Parse cameras from ANY listing page ───────────────────────
// Works for /bycountry/, /bytype/, /new/, /byrating/
function parseListingPage(html) {
  const entries = [];
  const seen = new Set();

  // Primary: id="imageXXXXX" src="http://..."  (same-line or multi-line)
  const re1 = /id="image(\d+)"[\s\S]*?src="(http[^"]+)"/g;
  let m;
  while ((m = re1.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      entries.push({ id: m[1], stream: m[2].replace(/&amp;/g, '&') });
    }
  }

  // Secondary: just collect IDs from href links (no stream URL yet)
  const re2 = /\/en\/view\/(\d+)\//g;
  while ((m = re2.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      entries.push({ id: m[1], stream: null }); // stream fetched from detail page
    }
  }

  return entries;
}

// ── Parse page count from listing page ────────────────────────
function parsePageCount(html) {
  const m = html.match(/pagenavigator\([^,]+,\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

// ── Parse coordinates from detail page ────────────────────────
function parseCoords(html) {
  const cells = html.split('camera-details__cell">');
  for (let i = 0; i < cells.length - 1; i++) {
    if (cells[i].includes('Latitude:')) {
      const lat = parseFloat(cells[i+1].split('<')[0].trim());
      for (let j = i+1; j < cells.length-1; j++) {
        if (cells[j].includes('Longitude:')) {
          const lng = parseFloat(cells[j+1].split('<')[0].trim());
          if (!isNaN(lat) && !isNaN(lng) && !(lat===0 && lng===0)) return {lat,lng};
          break;
        }
      }
    }
  }
  return null;
}

// ── Parse metadata ─────────────────────────────────────────────
function parseMeta(html, label) {
  const cells = html.split('camera-details__cell">');
  for (let i = 0; i < cells.length - 1; i++) {
    if (cells[i].includes(label)) {
      const raw = cells[i+1].split('</div>')[0];
      const a = raw.match(/<a[^>]*>([^<]+)<\/a>/);
      return (a ? a[1] : raw.replace(/<[^>]+>/g,'')).trim();
    }
  }
  return '';
}

// ── IP Geolocation (rate-limited: 45 req/min max) ─────────────
const _geoCache = {};
let _geoRequestCount = 0;
let _geoWindowStart  = Date.now();

async function geoIP(streamUrl) {
  const ip = streamUrl?.match(/https?:\/\/(\d+\.\d+\.\d+\.\d+)/)?.[1];
  if (!ip) return null;
  if (_geoCache[ip]) return _geoCache[ip];

  // Rate limit: max 40 requests per minute
  const now = Date.now();
  if (now - _geoWindowStart > 60000) { _geoRequestCount = 0; _geoWindowStart = now; }
  if (_geoRequestCount >= 40) {
    const wait = 60000 - (now - _geoWindowStart) + 500;
    await new Promise(r => setTimeout(r, wait));
    _geoRequestCount = 0; _geoWindowStart = Date.now();
  }
  _geoRequestCount++;

  try {
    const data = JSON.parse(await get(`http://ip-api.com/json/${ip}?fields=status,lat,lon,country,countryCode,city`));
    if (data.status === 'success' && data.lat) {
      const r = { lat: data.lat, lng: data.lon, country: data.country, cc: data.countryCode, city: data.city };
      _geoCache[ip] = r;
      return r;
    }
  } catch(e) {}
  return null;
}

// ── Resolve one camera fully ───────────────────────────────────
async function resolveCamera(id, streamHint) {
  const detail = await get(`http://insecam.org/en/view/${id}/`);
  if (!detail || detail.length < 500) return null;

  let stream = streamHint;
  if (!stream) {
    const sm = detail.match(/id="image\d+"[\s\S]*?src="(http[^"]+)"/);
    if (sm) stream = sm[1].replace(/&amp;/g,'&');
  }
  if (!stream) return null; // no stream = not usable

  const coords = parseCoords(detail);
  let lat = coords?.lat, lng = coords?.lng;
  const country      = parseMeta(detail, 'Country:');
  const city         = parseMeta(detail, 'City:');
  const manufacturer = parseMeta(detail, 'Manufacturer:');

  // Coordinate fallback chain
  if (!lat || !lng) {
    const geo = await geoIP(stream);
    if (geo) {
      lat = geo.lat; lng = geo.lng;
    } else {
      // Try to detect country from the page and use centroid
      const cc = country ? Object.keys(CENTROIDS).find(k =>
        CENTROIDS[k] && (country.toLowerCase().includes(k.toLowerCase()) ||
        k === Object.entries({US:'United States',JP:'Japan',IT:'Italy',DE:'Germany',
          RU:'Russia',AT:'Austria',CZ:'Czech',FR:'France',KR:'Korea',CH:'Switzerland',
          NO:'Norway',RO:'Romania',TW:'Taiwan',CA:'Canada',ES:'Spain',SE:'Sweden',
          NL:'Netherlands',PL:'Poland',GB:'United Kingdom',UA:'Ukraine',IN:'India',
          BG:'Bulgaria',DK:'Denmark',SK:'Slovakia',FI:'Finland',BE:'Belgium',
          HU:'Hungary',ZA:'South Africa',TR:'Turkey',GR:'Greece',BA:'Bosnia',
          TH:'Thailand',EG:'Egypt',NZ:'New Zealand',IE:'Ireland',BR:'Brazil',
          AU:'Australia',ID:'Indonesia',CL:'Chile',AR:'Argentina',CN:'China',
          LT:'Lithuania',MX:'Mexico',KZ:'Kazakhstan',MD:'Moldova',EE:'Estonia',
          VN:'Vietnam',HK:'Hong Kong',IL:'Israel',BY:'Belarus',SI:'Slovenia',
          PE:'Peru',GU:'Guam',PA:'Panama',BD:'Bangladesh',AM:'Armenia',SG:'Singapore',
          NI:'Nicaragua',CO:'Colombia',PT:'Portugal',HR:'Croatia',RS:'Serbia',LV:'Latvia',
          IR:'Iran'
        }).find(([k2,v]) => v === country)?.[0] || '')
      ) : null;
      const c = CENTROIDS[cc];
      if (c) {
        lat = c.lat + (Math.random()-0.5)*4;
        lng = c.lng + (Math.random()-0.5)*6;
      } else {
        return null; // truly no coordinates
      }
    }
  }

  return { id, country, city, manufacturer, lat, lng, stream };
}

// ── Batch runner ───────────────────────────────────────────────
async function batchMap(arr, fn, size=6) {
  const out = [];
  for (let i=0; i<arr.length; i+=size) {
    const res = await Promise.all(arr.slice(i,i+size).map(fn));
    out.push(...res.filter(Boolean));
  }
  return out;
}

// ── Scrape all pages of a listing URL ─────────────────────────
async function scrapeAllPages(baseUrl, label) {
  process.stdout.write(`  [${label}] `);
  const first = await get(`${baseUrl}?page=1`);
  if (!first || first.length < 500) { console.log('no response'); return {}; }
  const pages = parsePageCount(first);
  process.stdout.write(`${pages}p `);

  const htmlPages = [first];
  if (pages > 1) {
    const rest = await batchMap(
      Array.from({length: pages-1}, (_,i) => i+2),
      p => get(`${baseUrl}?page=${p}`), 5
    );
    htmlPages.push(...rest.filter(h=>h&&h.length>500));
  }

  const entries = {}; // id -> {id, stream}
  for (const html of htmlPages) {
    for (const e of parseListingPage(html)) {
      if (!entries[e.id]) entries[e.id] = e;
      else if (e.stream && !entries[e.id].stream) entries[e.id].stream = e.stream;
    }
  }
  console.log(`${Object.keys(entries).length} IDs`);
  return entries;
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  [OUT_DIR, BACKUP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

  console.log('═══════════════════════════════════════');
  console.log('  GODEYE SUPER SCRAPER — insecam.org');
  console.log('═══════════════════════════════════════\n');

  const masterIndex = {}; // id -> {id, stream}

  // ── Phase 1: Discover all cameras via all listing sources ──
  console.log('PHASE 1: Camera Discovery');
  console.log('─────────────────────────');

  // 1a. By Country
  let countries = [];
  try {
    const data = JSON.parse(await get('http://insecam.org/en/jsoncountries/'));
    countries = Object.entries(data.countries)
      .filter(([cc]) => cc.trim() && cc !== '-')
      .sort((a,b) => b[1].count - a[1].count)
      .map(([cc,info]) => ({cc, count: info.count}));
  } catch(e) {
    countries = Object.keys(CENTROIDS).map(cc => ({cc,count:1}));
  }
  console.log(`\nBy Country (${countries.length} countries):`);
  for (const {cc} of countries) {
    try {
      const entries = await scrapeAllPages(`http://insecam.org/en/bycountry/${cc}/`, cc);
      Object.assign(masterIndex, entries);
    } catch(e) {}
    await new Promise(r => setTimeout(r, 300));
  }

  // 1b. By Camera Type / Manufacturer
  console.log(`\nBy Camera Type:`);
  let types = [];
  try {
    const html = await get('http://insecam.org/en/bytype/');
    types = [...new Set([...html.matchAll(/href="\/en\/bytype\/([^"\/]+)\/"/g)].map(m=>m[1]))];
  } catch(e) {}
  console.log(`  Found ${types.length} types`);
  for (const t of types) {
    try {
      const entries = await scrapeAllPages(`http://insecam.org/en/bytype/${t}/`, t.substring(0,10));
      let added = 0;
      for (const [id,e] of Object.entries(entries)) {
        if (!masterIndex[id]) { masterIndex[id] = e; added++; }
        else if (e.stream && !masterIndex[id].stream) masterIndex[id].stream = e.stream;
      }
      if (added > 0) console.log(`  [${t}] +${added} new cameras`);
    } catch(e) {}
    await new Promise(r => setTimeout(r, 200));
  }

  // 1c. By Rating
  console.log(`\nBy Rating:`);
  try {
    const entries = await scrapeAllPages('http://insecam.org/en/byrating/', 'rating');
    let added = 0;
    for (const [id,e] of Object.entries(entries)) {
      if (!masterIndex[id]) { masterIndex[id] = e; added++; }
    }
    console.log(`  +${added} new cameras from rating`);
  } catch(e) {}

  const totalDiscovered = Object.keys(masterIndex).length;
  console.log(`\n✓ Discovery complete: ${totalDiscovered} unique camera IDs\n`);

  // ── Phase 2: Resolve each camera (coords + metadata) ──────
  console.log('PHASE 2: Resolving camera details');
  console.log('──────────────────────────────────');

  // Load existing data to skip already-resolved cameras
  let existing = {};
  if (fs.existsSync(OUT_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(OUT_FILE,'utf8'));
      old.forEach(c => { existing[c.id] = c; });
      console.log(`  Loaded ${old.length} existing cameras (will skip already resolved)\n`);
    } catch(e) {}
  }

  const allEntries = Object.values(masterIndex);
  const toResolve  = allEntries.filter(e => !existing[e.id]);
  const reuse      = allEntries.filter(e =>  existing[e.id]).map(e => existing[e.id]);

  console.log(`  ${reuse.length} already resolved, ${toResolve.length} need detail fetch\n`);

  const cameras = [...reuse];
  let done = 0;

  const resolved = await batchMap(toResolve, async entry => {
    try {
      const cam = await resolveCamera(entry.id, entry.stream);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`  Progress: ${done}/${toResolve.length} (${cameras.length + done} total)\n`);
        // Checkpoint save
        const snapshot = [...cameras, ...resolved.filter(Boolean)];
        fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2));
      }
      return cam;
    } catch(e) { return null; }
  }, 8);

  cameras.push(...resolved.filter(Boolean));

  // ── Phase 3: Write output ──────────────────────────────────
  console.log('\nPHASE 3: Writing output');
  console.log('───────────────────────');

  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
  console.log(`✅ Main file: ${OUT_FILE} (${cameras.length} cameras)`);

  // Timestamped backup
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const backupFile = path.join(BACKUP_DIR, `insecam_${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(cameras, null, 2));
  console.log(`✅ Backup:    ${backupFile}`);

  // Stats by country
  const byCc = {};
  cameras.forEach(c => { byCc[c.country] = (byCc[c.country]||0)+1; });
  const top10 = Object.entries(byCc).sort((a,b)=>b[1]-a[1]).slice(0,10);
  console.log('\nTop 10 countries:');
  top10.forEach(([c,n]) => console.log(`  ${(c||'Unknown').padEnd(20)} ${n}`));
  console.log(`\n  Total: ${cameras.length} cameras across ${Object.keys(byCc).length} countries`);
  console.log('\n═══════════════════════════════════════');

  return cameras.length;
}

main().then(n => {
  console.log(`\nSUPER SCRAPE COMPLETE — ${n} cameras`);
  process.exit(0);
}).catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
