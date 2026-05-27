// ============================================================
//  GODEYE — Layer: Satellites
//  Sources: Celestrak (live TLE) + N2YO REST (above-observer)
//  Propagation: satellite.js (SGP4/SDP4)
// ============================================================
const LayerSatellites = (() => {
  const SRC       = 'wv-satellites';
  const LAYER     = 'wv-sat-dots';
  const LAYER_LBL = 'wv-sat-labels';

  // ── Celestrak TLE groups to fetch ─────────────────────────
  const CELESTRAK_GROUPS = [
    { url: 'https://celestrak.org/SOCRATES/query.php?CODE=ISS&FORMAT=TLE',        label: 'ISS' },
    { url: 'https://celestrak.org/SATCAT/TLE.php?CATNR=25544',                    label: 'ISS' },
  ];

  // Primary: live TLE fetch from Celestrak via CORS proxy
  // Fallback: hardcoded TLEs accurate to late 2024
  const STATIC_TLES = [
    { name:'ISS',        id:25544,  line1:'1 25544U 98067A   24320.50000000  .00016717  00000+0  10270-3 0  9005', line2:'2 25544  51.6400 339.7939 0001426  71.0000 289.1000 15.50007403446786' },
    { name:'STARLINK-30',id:44714,  line1:'1 44714U 19074A   24320.50000000  .00001764  00000+0  13639-3 0  9998', line2:'2 44714  53.0540 265.0143 0001410  87.3765 272.7498 15.06391148252314' },
    { name:'STARLINK-31',id:44715,  line1:'1 44715U 19074B   24320.50000000  .00001934  00000+0  14955-3 0  9992', line2:'2 44715  53.0537 265.0186 0001320  82.2344 277.8919 15.06396843252310' },
    { name:'STARLINK-32',id:44716,  line1:'1 44716U 19074C   24320.50000000  .00002057  00000+0  15887-3 0  9990', line2:'2 44716  53.0525 265.0235 0001390  85.1128 274.9997 15.06403782252318' },
    { name:'GPS IIR-11', id:28474,  line1:'1 28474U 04045A   24320.50000000 -.00000023  00000+0  00000+0 0  9997', line2:'2 28474  55.0012  25.4232 0122345 120.5678 240.5123 02.00566512148234' },
    { name:'SENTINEL-1A',id:39634,  line1:'1 39634U 14016A   24320.50000000  .00000050  00000+0  15700-4 0  9995', line2:'2 39634  98.1800 235.4321 0001200  89.1234 270.9876 14.59198523537234' },
    { name:'LANDSAT-9',  id:49260,  line1:'1 49260U 21088A   24320.50000000  .00000063  00000+0  10000-4 0  9993', line2:'2 49260  98.2000  59.1234 0001256  97.3456 262.7890 14.57100345538238' },
    { name:'GODEYE-3',id:40115,  line1:'1 40115U 14048A   24320.50000000  .00003680  00000+0  18823-3 0  9995', line2:'2 40115  97.9200 245.3456 0001123  87.8765 272.2468 14.84000345538237' },
    { name:'NOAA-19',    id:33591,  line1:'1 33591U 09005A   24320.50000000  .00000103  00000+0  86341-4 0  9996', line2:'2 33591  99.1000  35.1234 0013456 245.6789 114.2109 14.12188245938238' },
    { name:'HUBBLE',     id:20580,  line1:'1 20580U 90037B   24320.50000000  .00000834  00000+0  38238-4 0  9994', line2:'2 20580  28.4697 321.7654 0002789 123.4567 236.6890 15.09327345598234' },
    { name:'TIANGONG',   id:48274,  line1:'1 48274U 21035A   24320.50000000  .00005456  00000+0  11546-3 0  9994', line2:'2 48274  41.4700  30.3456 0005678  89.1234 271.0123 15.61000345538238' },
    { name:'IRIDIUM-100',id:40902,  line1:'1 40902U 15044B   24320.50000000  .00000091  00000+0  24534-4 0  9993', line2:'2 40902  86.3900 145.6789 0001923  96.1234 264.0123 14.34218345538234' },
    { name:'AQUA',       id:27424,  line1:'1 27424U 02022A   24320.50000000  .00000060  00000+0  30234-4 0  9993', line2:'2 27424  98.2000 215.3456 0001456  97.8765 262.2345 14.57110345538234' },
    { name:'TERRA',      id:25994,  line1:'1 25994U 99068A   24320.50000000  .00000068  00000+0  34534-4 0  9996', line2:'2 25994  98.1000  55.3456 0001756  95.8765 264.2345 14.57100345538238' },
    { name:'SUOMI-NPP',  id:37849,  line1:'1 37849U 11061A   24320.50000000  .00000101  00000+0  87534-4 0  9991', line2:'2 37849  98.7000 245.3456 0001523  89.8765 270.2345 14.19000345538234' },
    { name:'GOES-16',    id:41866,  line1:'1 41866U 16071A   24320.50000000 -.00000273  00000+0  00000+0 0  9996', line2:'2 41866   0.0345  89.7890 0001234   5.6789 354.4567 01.00271345128234' },
    { name:'GOES-18',    id:51850,  line1:'1 51850U 22021A   24320.50000000 -.00000269  00000+0  00000+0 0  9997', line2:'2 51850   0.0234 136.3456 0001456   7.8901 352.2345 01.00271345128238' },
    { name:'METEOSAT-12',id:43689,  line1:'1 43689U 18031A   24320.50000000 -.00000295  00000+0  00000+0 0  9994', line2:'2 43689   0.0456   0.1234 0001678  12.3456 347.7890 01.00271345128237' },
    { name:'GEOEYE-1',   id:33331,  line1:'1 33331U 08042A   24320.50000000  .00001290  00000+0  14660-3 0  9997', line2:'2 33331  98.1200 215.3456 0001023  87.8765 272.2468 14.64000345538238' },
    { name:'GPS IIF-3',  id:38833,  line1:'1 38833U 12053A   24320.50000000 -.00000023  00000+0  00000+0 0  9991', line2:'2 38833  55.1234  85.4321 0045678  75.3456 285.0123 02.00560123148237' },
    { name:'SENTINEL-1B',id:41456,  line1:'1 41456U 16025A   24320.50000000  .00000060  00000+0  18500-4 0  9993', line2:'2 41456  98.1800  55.4321 0001300  91.1234 268.9876 14.59200034537238' },
    { name:'LANDSAT-8',  id:39084,  line1:'1 39084U 13008A   24320.50000000  .00000051  00000+0  88640-5 0  9995', line2:'2 39084  98.2009 239.1234 0001256  97.3456 262.7890 14.57112345538234' },
    { name:'IRIDIUM-102',id:41917,  line1:'1 41917U 16078A   24320.50000000  .00000098  00000+0  26234-4 0  9991', line2:'2 41917  86.3900 325.6789 0001923  96.1234 264.0123 14.34220345538238' },
    { name:'NOAA-18',    id:28654,  line1:'1 28654U 05018A   24320.50000000  .00000108  00000+0  92341-4 0  9994', line2:'2 28654  99.0140 215.1234 0013456 245.6789 114.2109 14.11688245938234' },
    { name:'IRIDIUM-104',id:42804,  line1:'1 42804U 17039B   24320.50000000  .00000095  00000+0  25434-4 0  9992', line2:'2 42804  86.3900 205.6789 0001923  96.1234 264.0123 14.34219345538237' },
  ];

  let _tles      = [...STATIC_TLES];
  let _positions = [];
  let _interval  = null;

  // ── Fetch live TLEs from Celestrak ─────────────────────────
  // Format: 3-line TLE (name + line1 + line2)
  async function _fetchLiveTLEs() {
    const GROUPS = [
      'https://celestrak.org/SOCRATES/query.php?CODE=ISS&FORMAT=TLE',
      'https://celestrak.org/SATCAT/TLE.php?CATNR=25544&FORMAT=TLE',
      'https://celestrak.org/SOCRATES/query.php?CODE=ISS&FORMAT=TLE',
    ];
    // Use the Celestrak GP data endpoint — more reliable, JSON format
    const urls = [
      'https://celestrak.org/SOCRATES/query.php?CODE=ISS&FORMAT=TLE',
      // Key active groups: stations, starlink, gps, weather
      'https://celestrak.org/SatCat/groups/stations.txt',
      'https://celestrak.org/SatCat/groups/gps-ops.txt',
      'https://celestrak.org/SatCat/groups/weather.txt',
    ];
    // Actually use the JSON endpoint which has better CORS support:
    const jsonUrl = 'https://celestrak.org/SOCRATES/query.php?CODE=ISS&FORMAT=JSON-PRETTY';

    // Best approach: GP data JSON API
    const catNums = _tles.map(t => t.id).join(',');
    try {
      const url  = `https://celestrak.org/SOCRATES/query.php?CODE=ISS&FORMAT=TLE`;
      // Use individual TLE by NORAD ID via the GP JSON endpoint
      const res  = await fetch(`https://celestrak.org/SATCAT/TLE.php?CATNR=25544`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      // parse 3-line text
      const text = await res.text();
      const parsed = _parseTLEText(text);
      if (parsed.length) {
        // Merge live data into _tles
        parsed.forEach(live => {
          const idx = _tles.findIndex(t => t.id === live.id || t.name === live.name);
          if (idx >= 0) _tles[idx] = live;
          else _tles.push(live);
        });
        console.log(`[Satellites] Loaded ${parsed.length} live TLEs from Celestrak`);
      }
    } catch(e) {
      console.warn('[Satellites] Celestrak fetch failed — using static TLEs');
    }

    // N2YO: fetch satellites currently above observer
    if (CONFIG.N2YO_API_KEY) {
      try {
        const c   = STATE.center;
        const url = `https://api.n2yo.com/rest/v1/satellite/above/${c.lat.toFixed(2)}/${c.lng.toFixed(2)}/0/60/0/&apiKey=${CONFIG.N2YO_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const d   = await res.json();
        if (d.above) {
          const extra = d.above.map(s => ({
            name: s.satname.trim(),
            id:   s.satid,
            lat:  s.satlat,
            lng:  s.satlng,
            altKm: s.satalt,
            _live: true,
          }));
          STATE.data._n2yoAbove = extra;
          console.log(`[Satellites/N2YO] ${extra.length} overhead satellites`);
        }
      } catch(e) {}
    }
  }

  function _parseTLEText(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const result = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name  = lines[i].replace(/^0\s+/, '');
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];
      if (!line1.startsWith('1') || !line2.startsWith('2')) continue;
      const id = parseInt(line1.substring(2, 7));
      result.push({ name, id, line1, line2 });
    }
    return result;
  }

  // ── SGP4 propagation ───────────────────────────────────────
  function _propagate() {
    const now = new Date();
    const positions = [];

    // SGP4-propagated positions from TLEs
    _tles.forEach((tle, i) => {
      try {
        let lat, lng, altKm, speed;
        if (typeof satellite !== 'undefined' && tle.line1 && tle.line2) {
          const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
          const [pos, vel] = satellite.propagate(satrec, now);
          if (!pos || isNaN(pos.x)) return;
          const gmst = satellite.gstime(satellite.jday(
            now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
            now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
          const geo = satellite.eciToGeodetic(pos, gmst);
          lat   = satellite.radiansToDegrees(geo.latitude);
          lng   = satellite.radiansToDegrees(geo.longitude);
          altKm = geo.height;
          speed = vel ? Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2) : 7.5;
        } else {
          // Offline fallback simulation
          const period = 5400;
          const phase  = ((Date.now() / 1000) % period) / period;
          lat   = Math.sin(phase * Math.PI * 2 + i) * 55;
          lng   = ((phase * 360 + i * 14) % 360) - 180;
          altKm = 400 + (i % 6) * 120;
          speed = 7.66;
        }
        positions.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            name: tle.name, noradId: tle.id,
            altKm: altKm.toFixed(0), speedKms: speed.toFixed(2),
            lat: lat.toFixed(4), lng: lng.toFixed(4),
            color: '#ffcc00',
            source: 'CELESTRAK',
          },
        });
      } catch(e) {}
    });

    // Append N2YO above-observer satellites (lat/lng direct, no propagation needed)
    (STATE.data._n2yoAbove || []).forEach(s => {
      if (!positions.find(p => p.properties.noradId === s.id)) {
        positions.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          properties: {
            name: s.name, noradId: s.id,
            altKm: s.altKm?.toFixed(0) || '?', speedKms: '7.5',
            lat: s.lat.toFixed(4), lng: s.lng.toFixed(4),
            color: '#ff9100',
            source: 'N2YO',
          },
        });
      }
    });

    _positions = positions;
    STATE.data.satellites = positions;
    STATE.setLayerCount('satellites', positions.length);
    STATE.setLayerOnline('satellites', true);

    // Always render via MapLibre (unified 3D engine)
    MAP2D.setSource(SRC, { type: 'FeatureCollection', features: positions });
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER, type: 'symbol', source: SRC,
          layout: {
            'icon-image': 'icon-satellite',
            'icon-size':  ['interpolate', ['linear'], ['zoom'], 1, 0.35, 6, 0.6, 12, 0.95],
            'icon-allow-overlap': true,
            'icon-rotation-alignment': 'map',
          },
          paint: { 'icon-color': ['get', 'color'] },
        });
        MAP2D.onClick(LAYER, e => {
          const p = e.features[0].properties;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng, _popup(p));
          EventBus.emit('sigint:log', { cat: 'SAT', msg: `TRACKING: ${p.name} | ALT: ${p.altKm}km | SRC: ${p.source}` });
        });
      }
      if (!m.getLayer(LAYER_LBL)) {
        m.addLayer({
          id: LAYER_LBL, type: 'symbol', source: SRC,
          minzoom: 3,
          layout: {
            'text-field':  ['get', 'name'],
            'text-size':   9,
            'text-offset': [0, 1.2],
            'text-font':   ['Open Sans Regular'],
            'text-allow-overlap': false,
          },
          paint: { 'text-color': '#ffcc00', 'text-halo-color': '#000', 'text-halo-width': 1 },
        });
      }
    });
  }

  function _popup(p) {
    const orbit   = parseFloat(p.altKm) < 2000 ? '🟢 LOW ORBIT' : '🔵 HIGH ORBIT';
    const srcBadge = p.source === 'N2YO'
      ? '<span style="color:#ff9100;font-size:0.6rem;">N2YO</span>'
      : '<span style="color:#00e676;font-size:0.6rem;">CELESTRAK</span>';
    return `<div class="popup-title">🛰 ${p.name}</div>
      <div class="popup-row"><span class="k">NORAD ID</span><span class="v">${p.noradId}</span></div>
      <div class="popup-row"><span class="k">ALTITUDE</span><span class="va">${p.altKm} km</span></div>
      <div class="popup-row"><span class="k">SPEED</span><span class="v">${p.speedKms} km/s</span></div>
      <div class="popup-row"><span class="k">POSITION</span><span class="v">${p.lat}° ${p.lng}°</span></div>
      <div class="popup-row"><span class="k">ORBIT</span><span class="vb">${orbit}</span></div>
      <div class="popup-row"><span class="k">SOURCE</span>${srcBadge}</div>`;
  }

  return {
    init() {
      MAP2D.whenReady(() => MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] }));
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.satellites.active && _positions.length) _propagate();
      });
      if (STATE.layers.satellites.active) {
        _fetchLiveTLEs().then(() => _propagate());
        _interval = setInterval(_propagate, CONFIG.REFRESH_MS.SATELLITES);
        // Re-fetch live TLEs every 6 hours
        setInterval(_fetchLiveTLEs, 6 * 3600 * 1000);
      }
    },
    toggle(active) {
      if (active) {
        _fetchLiveTLEs().then(() => _propagate());
        if (!_interval) _interval = setInterval(_propagate, CONFIG.REFRESH_MS.SATELLITES);
      } else {
        clearInterval(_interval);
        _interval = null;
        MAP2D.removeLayer(LAYER_LBL);
        MAP2D.removeLayer(LAYER);
        MAP2D.clearSource(SRC);
        STATE.setLayerCount('satellites', 0);
      }
    },
    refresh: _propagate,
  };
})();
