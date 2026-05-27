// ============================================================
//  GODEYE — Geo Utilities
// ============================================================
const GEO = {
  // Decimal degrees → DMS string
  toDMS(deg, isLat) {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const mAll = (abs - d) * 60;
    const m = Math.floor(mAll);
    const s = ((mAll - m) * 60).toFixed(1);
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${d}°${m}'${s}"${dir}`;
  },

  formatCoord(lat, lng) {
    return `${this.toDMS(lat, true)}  ${this.toDMS(lng, false)}`;
  },

  formatDecimal(lat, lng) {
    return `${lat.toFixed(5)}° ${lat >= 0 ? 'N' : 'S'},  ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`;
  },

  // Haversine distance in km
  distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  // Bounding box from center
  bbox(lat, lng, radiusKm = 500) {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    return { south: lat-dLat, north: lat+dLat, west: lng-dLng, east: lng+dLng };
  },

  // Circle GeoJSON polygon
  circleGeoJSON(lat, lng, radiusKm, steps = 64) {
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dLat  = (radiusKm / 111) * Math.cos(angle);
      const dLng  = (radiusKm / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
      coords.push([lng + dLng, lat + dLat]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
  },

  // Altitude color (low=green, mid=yellow, high=red)
  altitudeColor(altM) {
    if (!altM || altM < 0) return '#00ff41';
    if (altM < 3000)  return '#00ff41';
    if (altM < 8000)  return '#ffff00';
    if (altM < 12000) return '#ff6600';
    return '#ff0000';
  },

  // Format a timestamp relative to now
  timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  },

  // UTC string: "2026-MAY-16 | 14:32:01Z"
  utcString(d = new Date()) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const pad = n => String(n).padStart(2,'0');
    return `${d.getUTCFullYear()}-${months[d.getUTCMonth()]}-${pad(d.getUTCDate())} | ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
  },

  // Sigint timestamp: "[14:32:01Z]"
  sigintTime(d = new Date()) {
    const pad = n => String(n).padStart(2,'0');
    return `[${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z]`;
  },

  // Rotate SVG plane icon based on heading
  planeIconSVG(heading = 0, color = '#00ff41') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <g transform="rotate(${heading}, 10, 10)">
        <path d="M10 1 L13 8 L20 9 L14 13 L15 19 L10 16 L5 19 L6 13 L0 9 L7 8 Z" fill="${color}" opacity="0.9"/>
      </g></svg>`;
  },

  // Country flag emoji from ISO code
  countryFlag(iso2) {
    if (!iso2 || iso2.length !== 2) return '🏳';
    return iso2.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  },

  // GDELT tone → sentiment
  toneToSentiment(tone) {
    if (tone === undefined || tone === null) return 'neutral';
    if (tone < -2) return 'negative';
    if (tone > 2)  return 'positive';
    return 'neutral';
  },

  // Category from headline keywords
  categorize(headline) {
    const h = (headline || '').toLowerCase();
    if (/war|attack|bomb|explos|missile|airstrike|kill|shoot|army|military|troops|assault/.test(h)) return 'WAR';
    if (/quake|earthquake|flood|hurricane|tsunami|wildfire|volcano|storm|disaster/.test(h)) return 'DISASTER';
    if (/election|parliament|senate|president|minister|democrat|republican|vote|politic/.test(h)) return 'POLITICS';
    if (/economy|stock|market|inflation|gdp|trade|tariff|sanction|bank|currency/.test(h)) return 'ECONOMY';
    if (/crime|murder|arrest|police|drug|trafficking|terrorism|kidnap/.test(h)) return 'CRIME';
    if (/protest|riot|demonstrat|civil|unrest|strike/.test(h)) return 'CIVIL';
    return 'WORLD';
  },
};
