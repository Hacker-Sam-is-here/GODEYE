// ============================================================
//  GODEYE — API Helpers: Cache, Backoff, Rate Limiting
// ============================================================
const API = {
  _cache: {},
  _fails: {},
  _timers: {},
  CACHE_TTL: 10000,

  async get(url, { ttl = this.CACHE_TTL, proxy = false } = {}) {
    const now = Date.now();
    if (this._cache[url] && now - this._cache[url].ts < ttl) return this._cache[url].data;
    try {
      const data = proxy ? await CORS.fetchJSON(url) : await CORS.direct(url);
      this._cache[url] = { data, ts: now };
      this._fails[url] = 0;
      return data;
    } catch(e) {
      this._fails[url] = (this._fails[url] || 0) + 1;
      if (this._cache[url]) return this._cache[url].data;
      throw e;
    }
  },

  failCount(url) { return this._fails[url] || 0; },

  schedule(layerId, fn, intervalMs, staggerMs = 0) {
    clearInterval(this._timers[layerId]);
    setTimeout(() => { fn(); this._timers[layerId] = setInterval(fn, intervalMs); }, staggerMs);
  },

  cancel(layerId) { clearInterval(this._timers[layerId]); delete this._timers[layerId]; },

  backoffMs(fails) { return fails <= 0 ? 0 : Math.min(120000, 30000 * Math.pow(2, fails - 1)); },

  async fetchWithRetry(url, opts = {}, maxRetries = 3) {
    let lastErr;
    for (let i = 0; i < maxRetries; i++) {
      try {
        if (i > 0) await this._sleep(this.backoffMs(i));
        const res = await fetch(url, opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch(e) { lastErr = e; }
    }
    throw lastErr;
  },

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  async geolocateIPs(ips) {
    if (!ips.length) return [];
    try {
      const res = await fetch('http://ip-api.com/batch', {
        method: 'POST',
        body: JSON.stringify(ips.slice(0,100).map(ip => ({ query: ip, fields: 'status,country,countryCode,lat,lon,isp,org,as,query' }))),
        headers: { 'Content-Type': 'application/json' },
      });
      return await res.json();
    } catch(e) { return []; }
  },
};

const STAGGER = { _offset: 0, next(base=1000) { this._offset += base; return this._offset; } };
