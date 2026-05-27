// ============================================================
//  Insecam scraper — fixed with correct HTML patterns
//  Run: "C:\Program Files\nodejs\node.exe" scripts/scrape_insecam.js
//  Output: data/insecam_cameras.json
// ============================================================
const http = require('http');
const fs   = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5' };
const OUT_DIR  = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'insecam_cameras.json');
const cameras  = [];

// Fetch all available country codes from Insecam's own JSON API
async function getCountryCodes() {
  const html = await get('http://insecam.org/en/jsoncountries/');
  try {
    const data = JSON.parse(html);
    // Sort by camera count descending, return all codes
    return Object.entries(data.countries)
      .filter(([cc]) => cc !== '-')
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cc, info]) => ({ cc, count: info.count, name: info.country }));
  } catch(e) {
    console.warn('Failed to fetch country list, using fallback');
    return ['US','JP','IT','DE','RU','AT','CZ','FR','KR','CH','NO','RO','TW','CA','ES','SE','NL','PL','GB','UA','IN',
            'BG','DK','SK','FI','BE','HU','ZA','TR','GR','BA','TH','EG','NZ','IE','BR','AU','ID','CL','AR','CN',
            'LT','MX','KZ','MD','EE','VN','FO','HN','HK','IL','BY','SI','PE','GU','PA','BD','AM','SG','NI','CO']
      .map(cc => ({ cc, count: 1, name: cc }));
  }
}

function get(url, retries = 3) {
  return new Promise(resolve => {
    let attempt = 0;
    function try_() {
      attempt++;
      try {
        const req = http.get(url, { headers: HEADERS, timeout: 12000 }, res => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            resolve(get(res.headers.location, retries)); return;
          }
          let d = ''; res.setEncoding('utf8');
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
          res.on('error', () => attempt < retries ? setTimeout(try_, 600*attempt) : resolve(''));
        });
        req.on('error', () => attempt < retries ? setTimeout(try_, 600*attempt) : resolve(''));
        req.on('timeout', () => { req.destroy(); attempt < retries ? setTimeout(try_, 600*attempt) : resolve(''); });
      } catch(e) { resolve(''); }
    }
    try_();
  });
}

// Parse a value that follows a label like "Latitude:" inside camera-details__cell
function parseDetail(html, label) {
  const marker = label + '\n';
  const i = html.indexOf(marker);
  if (i === -1) return '';
  // Next camera-details__cell div contains the value
  const cellStart = html.indexOf('camera-details__cell">', i);
  if (cellStart === -1) return '';
  const valStart = cellStart + 'camera-details__cell">'.length;
  const valEnd   = html.indexOf('</div>', valStart);
  return html.slice(valStart, valEnd).replace(/<[^>]+>/g, '').trim();
}

// Parse linked values like Country/City which are <a ...>VALUE</a>
function parseLinkedDetail(html, label) {
  const marker = label + '\n';
  const i = html.indexOf(marker);
  if (i === -1) return '';
  const aStart = html.indexOf('<a ', i);
  if (aStart === -1 || aStart - i > 400) return '';
  const textStart = html.indexOf('>', aStart) + 1;
  const textEnd   = html.indexOf('</a>', textStart);
  return html.slice(textStart, textEnd).trim();
}

async function parseCameraPage(id) {
  const html = await get(`http://insecam.org/en/view/${id}/`);
  if (!html) return null;

  // Lat/Lng — plain text inside camera-details__cell
  const latStr = parseDetail(html, 'Latitude:');
  const lngStr = parseDetail(html, 'Longitude:');
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

  // Stream URL — id="image0" src="URL"
  let stream = '';
  const imgMatch = html.match(/id="image0"[\s\S]*?src="([^"]+)"/);
  if (imgMatch) {
    stream = imgMatch[1].replace(/&amp;/g, '&');
  } else {
    // Alternative: image0"\n src="URL"
    const alt = html.match(/image0"\s*\n\s*src="([^"]+)"/);
    if (alt) stream = alt[1].replace(/&amp;/g, '&');
  }
  if (!stream) return null;

  const country      = parseLinkedDetail(html, 'Country:');
  const city         = parseLinkedDetail(html, 'City:');
  const region       = parseLinkedDetail(html, 'Region:');
  const manufacturer = parseLinkedDetail(html, 'Manufacturer:');

  return { id, country, city, region, manufacturer, lat, lng, stream };
}

async function batchMap(arr, fn, batchSize = 8) {
  const results = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    const batch = arr.slice(i, i + batchSize);
    const res   = await Promise.all(batch.map(fn));
    results.push(...res.filter(Boolean));
  }
  return results;
}

async function scrapeCountry(cc) {
  process.stdout.write(`[${cc}] Getting page count... `);
  const first = await get(`http://insecam.org/en/bycountry/${cc}/?page=1`);
  if (!first) { console.log('no response'); return; }

  let pages = 1;
  try { pages = parseInt(first.split('pagenavigator("?page=", ')[1].split(',')[0], 10) || 1; } catch(e) {}
  const maxPages = pages; // scrape ALL pages
  console.log(`${maxPages} pages`);

  // Collect IDs from all pages
  const pageHTMLs = await batchMap(
    Array.from({length: maxPages}, (_,i) => i+1),
    p => get(`http://insecam.org/en/bycountry/${cc}/?page=${p}`),
    4
  );

  const ids = new Set();
  for (const html of pageHTMLs) {
    const re = /\/en\/view\/(\d+)\//g; let m;
    while ((m = re.exec(html)) !== null) ids.add(m[1]);
  }
  console.log(`[${cc}] ${ids.size} IDs found, scraping...`);

  const cams = await batchMap([...ids], async id => {
    const cam = await parseCameraPage(id);
    if (cam) process.stdout.write(`  ✓ ${cam.city || cam.country} (${cam.lat.toFixed(2)},${cam.lng.toFixed(2)})\n`);
    return cam;
  }, 6);

  cameras.push(...cams);
  console.log(`[${cc}] +${cams.length} cameras | Total: ${cameras.length}`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Test parser first
  console.log('Testing parser on camera 521291...');
  const test = await parseCameraPage('521291');
  console.log('Test result:', JSON.stringify(test));
  if (!test) { console.error('Parser test failed — aborting'); process.exit(1); }

  // Get all countries from Insecam API
  console.log('\nFetching country list from Insecam...');
  const countries = await getCountryCodes();
  console.log(`Found ${countries.length} countries:`, countries.map(c => `${c.cc}(${c.count})`).join(' '));

  for (const { cc, count, name } of countries) {
    try { await scrapeCountry(cc); } catch(e) { console.warn(`[${cc}] Error:`, e.message); }
    await new Promise(r => setTimeout(r, 600));
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(cameras, null, 2));
  console.log(`\n✅ Scraped ${cameras.length} cameras from ${countries.length} countries → ${OUT_FILE}`);
}

main().catch(console.error);
