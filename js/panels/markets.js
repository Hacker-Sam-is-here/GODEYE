// ============================================================
//  GODEYE — Panel: Markets (Defense Stocks + Commodities + Space Weather)
// ============================================================
const MarketsPanel = (() => {
  let _refreshInterval = null;
  let _spaceWeatherInterval = null;

  // Yahoo Finance informal proxy (works browser-side, no key)
  async function _fetchQuote(symbol) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res  = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price  = meta.regularMarketPrice || 0;
      const prev   = meta.previousClose || price;
      const change = price - prev;
      const pct    = prev ? (change / prev) * 100 : 0;
      return { symbol, name: meta.longName || symbol, price, change, pct, currency: meta.currency || 'USD' };
    } catch { return null; }
  }

  async function _fetchSpaceWeather() {
    try {
      const url = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
      const res  = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const last = data[data.length - 1];
      const kp = parseFloat(last?.kp_index || 0);
      let level = 'G0', color = '#00E676', label = 'QUIET';
      if (kp >= 9) { level = 'G5'; color = '#FF3D3D'; label = 'EXTREME'; }
      else if (kp >= 8) { level = 'G4'; color = '#FF3D3D'; label = 'SEVERE'; }
      else if (kp >= 7) { level = 'G3'; color = '#ff9100'; label = 'STRONG'; }
      else if (kp >= 6) { level = 'G2'; color = '#ffd600'; label = 'MODERATE'; }
      else if (kp >= 5) { level = 'G1'; color = '#ffd600'; label = 'MINOR'; }
      STATE.data.spaceWeather = { kp, level, color, label, ts: last?.time_tag };
      EventBus.emit('space:weather', STATE.data.spaceWeather);
    } catch { /* silent */ }
  }

  async function _refresh() {
    const symbols = MARKET_SYMBOLS.map(s => s.symbol);
    const results = await Promise.all(symbols.map(_fetchQuote));
    STATE.data.markets = results.filter(Boolean);
    EventBus.emit('markets:update', STATE.data.markets);
    _renderMarkets();
  }

  function _renderMarkets() {
    const container = document.getElementById('markets-stocks');
    if (!container) return;
    const data = STATE.data.markets;
    if (!data.length) {
      container.innerHTML = '<div style="padding:10px;color:var(--green-dim);font-size:0.72rem;text-align:center;">FETCHING MARKET DATA…</div>';
      return;
    }
    const defenseItems = data.filter(d => {
      const sym = MARKET_SYMBOLS.find(m => m.symbol === d.symbol);
      return sym?.sector === 'defense';
    });
    const macroItems = data.filter(d => {
      const sym = MARKET_SYMBOLS.find(m => m.symbol === d.symbol);
      return sym?.sector !== 'defense';
    });

    function _row(d) {
      const up   = d.change >= 0;
      const cls  = up ? 'vb' : 'vr';
      const sign = up ? '▲' : '▼';
      return `<div class="market-row">
        <div class="market-symbol">${d.symbol}</div>
        <div class="market-name">${d.name.split(' ').slice(0,2).join(' ')}</div>
        <div class="market-price">${d.price.toFixed(2)}</div>
        <div class="market-change ${cls}">${sign} ${Math.abs(d.pct).toFixed(2)}%</div>
      </div>`;
    }

    container.innerHTML = `
      <div class="market-section-label">⚔ DEFENSE SECTOR</div>
      ${defenseItems.map(_row).join('')}
      <div class="market-section-label" style="margin-top:6px;">📊 COMMODITIES & MACRO</div>
      ${macroItems.map(_row).join('')}
    `;
  }

  function _renderSpaceWeather() {
    const sw = STATE.data.spaceWeather;
    const el = document.getElementById('space-weather-display');
    if (!el) return;
    if (!sw) {
      el.innerHTML = '<span style="color:var(--green-dim)">FETCHING NOAA DATA…</span>';
      return;
    }
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="color:var(--green-dim);font-size:0.68rem;">SOLAR KP-INDEX:</span>
        <span style="color:${sw.color};font-size:1.1rem;font-weight:bold;">${sw.kp.toFixed(1)}</span>
        <span style="border:1px solid ${sw.color};padding:1px 6px;border-radius:3px;color:${sw.color};font-size:0.65rem;">${sw.level} ${sw.label}</span>
      </div>
      <div style="font-size:0.6rem;color:#005510;margin-top:3px;">
        SOURCE: NOAA SWPC ${sw.ts ? '· ' + sw.ts.slice(0,16) + 'Z' : ''}
      </div>`;
  }

  EventBus.on('space:weather', _renderSpaceWeather);

  return {
    init() {
      const body = document.getElementById('tab-markets');
      if (!body) return;

      body.innerHTML = `
        <div class="feed-header" style="flex-shrink:0;">
          <span class="feed-title">📊 GLOBAL MARKETS</span>
          <span class="feed-updated" id="markets-updated">INITIALIZING…</span>
        </div>
        <!-- Space Weather Block -->
        <div style="padding:8px 10px;border-bottom:1px solid var(--border);background:rgba(0,10,0,0.3);">
          <div style="font-size:0.65rem;color:var(--amber);letter-spacing:0.15em;margin-bottom:5px;">☀ SPACE WEATHER / NOAA SWPC</div>
          <div id="space-weather-display" style="font-family:var(--font);font-size:0.75rem;"></div>
        </div>
        <!-- Stocks & Commodities -->
        <div id="markets-stocks" class="articles-list" style="padding:6px 0;flex:1;overflow-y:auto;"></div>
        <div style="padding:6px 8px;border-top:1px solid var(--border);flex-shrink:0;">
          <div style="font-size:0.6rem;color:#005510;text-align:center;">
            DATA: YAHOO FINANCE · NOAA SWPC · 5-MIN REFRESH
          </div>
        </div>`;

      _fetchSpaceWeather();
      _refresh();
      _refreshInterval = setInterval(() => {
        _refresh();
        const el = document.getElementById('markets-updated');
        if (el) el.textContent = 'UPDATED: ' + new Date().toISOString().slice(11,19) + 'Z';
      }, CONFIG.REFRESH_MS.MARKETS);
      _spaceWeatherInterval = setInterval(_fetchSpaceWeather, 300000);

      EventBus.emit('sigint:log', { cat: 'MARKETS', msg: 'MARKET FEED INITIALIZED' });
    },
  };
})();
