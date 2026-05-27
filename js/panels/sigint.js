// ============================================================
//  GODEYE — SIGINT Log Panel + Assets + DEFCON
// ============================================================
const SigintPanel = (() => {
  let _paused = false;
  let _logEl = null;
  let _maxEntries = 200;

  const DEFCON_LABELS = { 1:'DEFCON 1 — COCKED PISTOL', 2:'DEFCON 2 — FAST PACE', 3:'DEFCON 3 — ROUND HOUSE', 4:'DEFCON 4 — DOUBLE TAKE', 5:'DEFCON 5 — FADE OUT' };

  function _buildSigintTab() {
    const container = document.getElementById('tab-sigint');
    container.innerHTML = `
      <div class="feed-header">
        <span class="feed-title">SIGINT LOG</span>
        <button id="sigint-pause-btn" class="action-btn" style="font-size:0.65rem;padding:3px 8px;">⏸ PAUSE</button>
      </div>
      <div id="sigint-log"></div>`;

    _logEl = document.getElementById('sigint-log');

    document.getElementById('sigint-pause-btn').addEventListener('click', () => {
      _paused = !_paused;
      document.getElementById('sigint-pause-btn').textContent = _paused ? '▶ RESUME' : '⏸ PAUSE';
    });
  }

  function _buildAssetsTab() {
    const container = document.getElementById('tab-assets');
    container.innerHTML = `
      <div style="padding:10px;">
        <div id="defcon-wrap">
          <div class="defcon-label">THREAT LEVEL</div>
          <div class="defcon-levels" id="defcon-levels">
            <div class="defcon-pip" id="dp1" title="DEFCON 5 — Normal"></div>
            <div class="defcon-pip" id="dp2" title="DEFCON 4 — Increased"></div>
            <div class="defcon-pip" id="dp3" title="DEFCON 3 — Elevated"></div>
            <div class="defcon-pip" id="dp4" title="DEFCON 2 — High"></div>
            <div class="defcon-pip" id="dp5" title="DEFCON 1 — Maximum"></div>
          </div>
          <div id="defcon-text" style="font-size:0.65rem;color:var(--green-dim);text-align:center;margin-top:4px;">DEFCON 5 — FADE OUT</div>
        </div>

        <div id="assets-panel">
          <div class="asset-row"><span class="asset-label">✈ AIRCRAFT TRACKED</span><span class="asset-count" id="asset-aircraft">--</span></div>
          <div class="asset-row"><span class="asset-label">⛴ VESSELS TRACKED</span><span class="asset-count" id="asset-ships">--</span></div>
          <div class="asset-row"><span class="asset-label">🛰 SATELLITES</span><span class="asset-count" id="asset-satellites">--</span></div>
          <div class="asset-row"><span class="asset-label">⚔ CONFLICT EVENTS (24h)</span><span class="asset-count" id="asset-conflicts">--</span></div>
          <div class="asset-row"><span class="asset-label">🌍 EARTHQUAKES (24h)</span><span class="asset-count" id="asset-earthquakes">--</span></div>
          <div class="asset-row"><span class="asset-label">📰 NEWS ARTICLES (1h)</span><span class="asset-count" id="asset-news">--</span></div>
          <div class="asset-row"><span class="asset-label">🕷 CYBER THREATS</span><span class="asset-count" id="asset-cyber">--</span></div>
        </div>

        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
          <div style="font-size:0.65rem;color:var(--amber);letter-spacing:0.15em;margin-bottom:6px;">FEED STATUS</div>
          <div id="feed-status-list"></div>
        </div>
      </div>`;
  }

  function _updateDefcon(level) {
    for (let i = 1; i <= 5; i++) {
      const pip = document.getElementById(`dp${i}`);
      if (!pip) continue;
      pip.className = 'defcon-pip';
      if (i <= level) pip.classList.add(`active-${i}`);
    }
    const txt = document.getElementById('defcon-text');
    if (txt) txt.textContent = DEFCON_LABELS[level] || '';
  }

  function _updateAssets() {
    const c = STATE.counts;
    const upd = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    upd('asset-aircraft',  c.aircraft   || '--');
    upd('asset-ships',     Object.keys(STATE.data.ships || {}).length || '--');
    upd('asset-satellites',c.satellites || '--');
    upd('asset-conflicts', c.conflicts  || '--');
    upd('asset-earthquakes',c.earthquakes || '--');
    upd('asset-news',      c.news       || '--');
    upd('asset-cyber',     c.cyber      || '--');

    // Feed status
    const list = document.getElementById('feed-status-list');
    if (!list) return;
    list.innerHTML = Object.entries(STATE.layers).map(([id, layer]) => `
      <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.65rem;">
        <span style="color:var(--green-dim);">${layer.icon} ${layer.label}</span>
        <span style="color:${layer.online ? 'var(--green)' : 'var(--red)'};">${layer.online ? '● LIVE' : '○ OFFLINE'}</span>
      </div>`).join('');
  }

  return {
    init() {
      _buildSigintTab();
      _buildAssetsTab();

      // Listen for log entries
      EventBus.on('sigint:log', entry => {
        if (!_logEl) return;
        const div = document.createElement('div');
        div.className = 'sigint-entry new';
        const ts = GEO.sigintTime();
        const color = entry.level === 'danger' ? 'var(--red)' : entry.level === 'warn' ? 'var(--amber)' : 'var(--green-dim)';
        div.innerHTML = `<span class="ts">${ts}</span><span class="cat" style="color:var(--amber);">[${(entry.cat||'SYS').padEnd(8)}]</span> <span style="color:${color};">${entry.msg}</span>`;

        if (!_paused) {
          _logEl.insertBefore(div, _logEl.firstChild);
          setTimeout(() => div.classList.remove('new'), 600);
          // Trim
          while (_logEl.children.length > _maxEntries) _logEl.removeChild(_logEl.lastChild);
        }

        // Store in state
        STATE.data.sigintLog.unshift({ ts: Date.now(), ...entry });
        if (STATE.data.sigintLog.length > _maxEntries) STATE.data.sigintLog.pop();
      });

      // Update assets every 3 seconds
      setInterval(_updateAssets, 3000);

      // DEFCON updates
      EventBus.on('threat:update', level => _updateDefcon(level));

      // Layer count changes
      EventBus.on('layer:count', () => _updateAssets());

      // Boot log entries
      setTimeout(() => {
        EventBus.emit('sigint:log', { cat: 'SYSTEM', msg: 'GODEYE GEOSPATIAL INTELLIGENCE SYSTEM INITIALIZED' });
        EventBus.emit('sigint:log', { cat: 'SYSTEM', msg: 'LOADING OSINT DATA FEEDS — STANDBY...' });
      }, 1000);
    },
  };
})();
