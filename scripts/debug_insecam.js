// Quick diagnostic — run this to see exactly what Insecam returns for CA
// node scripts/debug_insecam.js
const http = require('http');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5' };

function get(url) {
  return new Promise(resolve => {
    http.get(url, { headers: HEADERS, timeout: 12000 }, res => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
      res.on('error', () => resolve(''));
    }).on('error', () => resolve(''));
  });
}

async function main() {
  const cc = process.argv[2] || 'CA';
  console.log(`\n=== Testing country: ${cc} ===`);

  const html = await get(`http://insecam.org/en/bycountry/${cc}/?page=1`);
  console.log(`\nHTML length: ${html.length} bytes`);
  if (html.length < 100) { console.log('BLOCKED or empty response'); return; }

  // Check page count
  const pageMatch = html.match(/pagenavigator\(".*?",\s*(\d+)/);
  console.log(`Page count: ${pageMatch ? pageMatch[1] : 'not found'}`);

  // Find camera IDs
  const ids = [...html.matchAll(/\/en\/view\/(\d+)\//g)].map(m => m[1]);
  const uniqueIds = [...new Set(ids)];
  console.log(`\nCamera IDs found: ${uniqueIds.length} → ${uniqueIds.slice(0,10).join(', ')}`);

  // Look for stream URLs (http:// image src)
  const streamMatches = [...html.matchAll(/src="(http:\/\/[^"]+)"/g)];
  console.log(`\nStream URLs found: ${streamMatches.length}`);
  streamMatches.slice(0,5).forEach(m => console.log('  ', m[1]));

  // Show a raw snippet around first camera
  if (uniqueIds.length > 0) {
    const idx = html.indexOf(`/en/view/${uniqueIds[0]}/`);
    const snippet = html.slice(Math.max(0, idx - 50), idx + 400);
    console.log(`\n--- RAW HTML snippet around first camera ---`);
    console.log(snippet.replace(/\n\s*\n/g, '\n'));
  }

  // Test one camera detail page
  if (uniqueIds.length > 0) {
    const id = uniqueIds[0];
    console.log(`\n=== Detail page for camera ${id} ===`);
    const detail = await get(`http://insecam.org/en/view/${id}/`);
    console.log(`Detail HTML length: ${detail.length}`);

    // Look for stream
    const imgMatch = detail.match(/src="(http:\/\/[^"]+)"/);
    console.log(`Stream URL: ${imgMatch ? imgMatch[1] : 'NOT FOUND'}`);

    // Look for coords
    const latMatch = detail.match(/[Ll]atitude[^\d\-]*([0-9\-\.]+)/);
    const lngMatch = detail.match(/[Ll]ongitude[^\d\-]*([0-9\-\.]+)/);
    console.log(`Lat: ${latMatch ? latMatch[1] : 'NOT FOUND'}`);
    console.log(`Lng: ${lngMatch ? lngMatch[1] : 'NOT FOUND'}`);

    // Show raw detail snippet
    const coordIdx = detail.indexOf('atitude');
    if (coordIdx > -1) {
      console.log('\n--- Coords area ---');
      console.log(detail.slice(coordIdx - 50, coordIdx + 200));
    }
  }
}

main().catch(console.error);
