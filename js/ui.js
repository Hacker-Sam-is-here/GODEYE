// ============================================================
//  GODEYE — Main UI Orchestrator (loads last)
// ============================================================

// Global error guard — ensures loading screen never blocks the UI
window.addEventListener('error', e => {
  console.error('[GODEYE Error]', e.message, e.filename, e.lineno);
});

(async function initGODEYE() {
  // ── Load user preferences ──────────────────────────────────
  try { STATE.loadPrefs(); } catch(e) {}

  // ── Loading Screen helpers ──────────────────────────────────
  const terminal = document.getElementById('loading-terminal');
  const barEl    = document.getElementById('loading-bar');
  const pctEl    = document.getElementById('loading-percent');

  function _addLine(msg, pct) {
    try {
      if (barEl) barEl.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      if (!terminal) return;
      terminal.innerHTML = `
        <div style="text-align:center; color:#00ff41; font-size:1.1rem; letter-spacing:0.2em; animation: fadeInLine 0.2s ease forwards;">
          &gt; ${msg}
        </div>`;
    } catch(e) {}
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function _dismissLoadingScreen() {
    const el = document.getElementById('loading-screen');
    if (!el) return;
    el.style.transition = 'opacity 0.7s ease';
    el.style.opacity = '0';
    setTimeout(() => { try { el.remove(); } catch(e) {} }, 800);
  }

  // Hard timeout — loading screen ALWAYS dismisses after 12s regardless
  const _forceTimeout = setTimeout(() => {
    console.warn('[GODEYE] Force-dismissing loading screen after timeout');
    _dismissLoadingScreen();
  }, 12000);

  // ── Loading Steps (Restored Animation) ──────────────────────
  const STEPS = [
    { msg: 'INITIALIZING GODEYE CORE SYSTEMS...',   pct: 15 },
    { msg: 'CONNECTING TO OSINT DATA FEEDS...',        pct: 30 },
    { msg: 'LOADING GEOSPATIAL ENGINE...',             pct: 45 },
    { msg: 'PROPAGATING SATELLITE POSITIONS...',       pct: 60 },
    { msg: 'LOADING INTELLIGENCE MODULES...',          pct: 72 },
    { msg: 'ESTABLISHING SECURE UPLINK...',            pct: 85 },
    { msg: 'CALIBRATING SENSORS...',                   pct: 95 },
    { msg: 'GODEYE ONLINE.',                        pct: 100 },
  ];

  let currentStep = 0;
  
  function startApp() {
    clearTimeout(_forceTimeout);
    _dismissLoadingScreen();

    // ── Initialize unified MapLibre engine ────────────────────
    try {
      MAP2D.init();
      // Restore 3D mode if it was saved
      if (STATE.mapMode === '3d') {
        MAP2D.whenReady(() => MAP2D.enable3D());
        document.getElementById('btn-mode-toggle').textContent = '3D MODE';
        document.body.classList.add('mode-3d');
      }
    } catch(e) {
      console.error('Fatal map error:', e);
      document.getElementById('map-container').innerHTML =
        `<div style="color:red;padding:20px;">Map Engine Failed: ${e.message}</div>`;
      return;
    }

    // ── Build layer toggle list ─────────────────────────────────
    const leftBody = document.getElementById('left-panel-body');
    if (leftBody) {
      Object.entries(STATE.layers).forEach(([id, layer]) => {
        const div = document.createElement('div');
        div.className = 'layer-item' + (layer.active ? ' active' : '');
        div.id = `layer-item-${id}`;
        div.dataset.id = id;
        div.innerHTML = `
          <span class="layer-icon">${layer.icon}</span>
          <div class="layer-info">
            <div class="layer-name">${layer.label}</div>
            <div class="layer-badges">
              <span class="badge-count" id="badge-count-${id}">--</span>
              <span class="badge-status-${id}"></span>
            </div>
          </div>
          <div class="layer-toggle"></div>`;
        div.addEventListener('click', () => _toggleLayer(id));
        leftBody.appendChild(div);
      });
    }

    // Layer count/online update
    EventBus.on('layer:count', ({ id, count }) => {
      const el = document.getElementById(`badge-count-${id}`);
      if (el) el.textContent = count > 0 ? `${count}` : '--';
    });

    EventBus.on('layer:online', ({ id, online }) => {
      const item = document.getElementById(`layer-item-${id}`);
      if (!item) return;
      const existing = item.querySelector('.badge-offline, .badge-online');
      existing?.remove();
      const badge = document.createElement('span');
      badge.className = online ? 'badge-online' : 'badge-offline';
      badge.textContent = online ? '' : 'OFFLINE';
      item.querySelector('.layer-badges')?.appendChild(badge);
    });

    // ── Initialize all modules ─────────────────────────────────
    try { SigintPanel.init(); } catch(e) { console.error('Sigint error', e); }
    try { LiveFeedPanel.init(); } catch(e) { console.error('LiveFeed error', e); }
    try { CityIntelPanel.init(); } catch(e) { console.error('CityIntel error', e); }
    try { SearchTool.init(); } catch(e) { console.error('Search error', e); }
    try { DrawTool.init(); } catch(e) { console.error('Draw error', e); }
    try { ReportTool.init(); } catch(e) { console.error('Report error', e); }
    try { TimeSlider.init(); } catch(e) { console.error('TimeSlider error', e); }
    try { MarketsPanel.init(); } catch(e) { console.error('Markets error', e); }
    try { ReconPanel.init(); } catch(e) { console.error('Recon error', e); }
    try { AnuOSINT.init(); } catch(e) { console.error('AnuOSINT error', e); }
    try { AlertsPanel.init(); } catch(e) { console.error('Alerts error', e); }
    try { ShareTool.init(); } catch(e) { console.error('Share error', e); }

    // Data layers init
    try { LayerMaritime.init(); } catch(e) {}
    try { LayerAircraft.init(); } catch(e) {}
    try { LayerShips.init(); } catch(e) {}
    try { LayerSatellites.init(); } catch(e) {}
    try { LayerEarthquakes.init(); } catch(e) {}
    try { LayerConflicts.init(); } catch(e) {}
    try { LayerCyber.init(); } catch(e) {}
    try { LayerNofly.init(); } catch(e) {}
    try { LayerCameras.init(); } catch(e) {}
    try { LayerNews.init(); } catch(e) {}
    try { LayerOSMFlow.init(); } catch(e) {}
    // OSIRIS new layers
    try { LayerFires.init(); } catch(e) {}
    try { LayerWeather.init(); } catch(e) {}
    try { LayerWarAlerts.init(); } catch(e) {}
    try { LayerInfrastructure.init(); } catch(e) {}
    try { LayerGPSJamming.init(); } catch(e) {}
    try { LayerDayNight.init(); } catch(e) {}
    try { LayerLiveNewsGeo.init(); } catch(e) {}

    // ── Presets quick-jump grid ────────────────────────────────
    const presetsBody = document.getElementById('presets-body');
    if (presetsBody) {
      HOTSPOTS.forEach(h => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.title = `${h.name} (zoom ${h.zoom})`;
        btn.textContent = h.name;
        btn.addEventListener('click', () => {
          MAP2D.flyTo(h.lat, h.lng, h.zoom);
          EventBus.emit('sigint:log', { cat: 'NAV', msg: `JUMPED TO: ${h.name}` });
        });
        presetsBody.appendChild(btn);
      });
      // Presets toggle collapse
      document.getElementById('presets-toggle')?.addEventListener('click', () => {
        presetsBody.style.display = presetsBody.style.display === 'none' ? '' : 'none';
        const arrow = document.getElementById('presets-arrow');
        if (arrow) arrow.textContent = presetsBody.style.display === 'none' ? '▸' : '▾';
      });
    }

    // ── TV Channel Grid (expanded) ─────────────────────────────
    const tvGrid = document.getElementById('tv-channel-grid');
    if (tvGrid) {
      Object.entries(TV_CHANNELS).forEach(([key, ch]) => {
        const btn = document.createElement('button');
        btn.className = 'tv-ch-btn';
        btn.dataset.chKey = key;
        btn.dataset.region = ch.region;
        btn.innerHTML = `${ch.name} <span class="tv-region-badge">${ch.region}</span>`;
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tv-ch-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const iframe = document.getElementById('tv-iframe');
          if (iframe) iframe.src = ch.src;
          const nowPlaying = document.getElementById('tv-now-playing');
          if (nowPlaying) nowPlaying.textContent = ch.name;
          EventBus.emit('sigint:log', { cat: 'MEDIA', msg: `CHANNEL: ${ch.name}` });
        });
        tvGrid.appendChild(btn);
      });
      // Region filter pills
      document.querySelectorAll('[data-tvregion]').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('[data-tvregion]').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const region = pill.dataset.tvregion;
          document.querySelectorAll('.tv-ch-btn').forEach(btn => {
            btn.style.display = (region === 'ALL' || btn.dataset.region === region) ? '' : 'none';
          });
        });
      });
      // Set first button active
      tvGrid.querySelector('.tv-ch-btn')?.classList.add('active');
    }

    // TV open stream from live news geo dots
    EventBus.on('tv:open', ({ url, name }) => {
      const iframe = document.getElementById('tv-iframe');
      const panel  = document.getElementById('live-tv-panel');
      if (iframe) iframe.src = url;
      if (panel) panel.classList.remove('hidden');
      const nowPlaying = document.getElementById('tv-now-playing');
      if (nowPlaying) nowPlaying.textContent = name;
    });

  } // end startApp()

  // Run the animation loop
  const animInterval = setInterval(() => {
    if (currentStep >= STEPS.length) {
      clearInterval(animInterval);
      startApp();
      return;
    }
    const step = STEPS[currentStep];
    _addLine(step.msg, step.pct);
    currentStep++;
  }, 350);

  // ── UTC Clock ───────────────────────────────────────────────
  function _tickClock() {
    const el = document.getElementById('utc-clock');
    if (el) el.textContent = GEO.utcString();
  }
  _tickClock();
  setInterval(_tickClock, 1000);

  // ── Bottom local time at map center ────────────────────────
  async function _updateLocalTime() {
    const el = document.getElementById('local-time-display');
    if (!el) return;
    try {
      // Use offset approximation (lon / 15 hours)
      const offsetHrs = STATE.center.lng / 15;
      const localMs = Date.now() + offsetHrs * 3600000;
      const d = new Date(localMs);
      const pad = n => String(n).padStart(2,'0');
      el.textContent = `LOCAL: ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    } catch(e) {}
  }
  setInterval(_updateLocalTime, 1000);

  // ── Bottom ticker ───────────────────────────────────────────
  function _updateTicker() {
    const el = document.getElementById('bottom-ticker');
    if (!el) return;
    const c = STATE.counts;
    const ships = Object.keys(STATE.data.ships || {}).length;
    el.textContent = [
      `AIS: ${STATE.layers.ships.online ? 'ACTIVE' : 'OFFLINE'}`,
      `FLIGHTS: ${c.aircraft || '--'}`,
      `SATS: ${c.satellites || '--'}`,
      `CONFLICTS: ${c.conflicts || '--'}`,
      `EARTHQUAKES: ${c.earthquakes || '--'}`,
      `SHIPS: ${ships || '--'}`,
      `CYBER: ${c.cyber || '--'}`,
      `NEWS: ${c.news || '--'}`,
      `THREAT: DEFCON ${STATE.threatLevel}`,
    ].join('   |   ');
  }
  EventBus.on('ticker:update', _updateTicker);
  setInterval(_updateTicker, 5000);
  _updateTicker();

  // ── Feed count badge ────────────────────────────────────────
  function _updateFeedCount() {
    const active = Object.values(STATE.layers).filter(l => l.active && l.online).length;
    const el = document.getElementById('feed-count');
    if (el) el.textContent = active;
  }
  EventBus.on('layer:online', _updateFeedCount);
  setInterval(_updateFeedCount, 5000);

  // ── Panel collapse/expand ───────────────────────────────────
  document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isLeft = btn.dataset.target === 'left-panel';
      target.classList.toggle('collapsed');
      const tab = document.getElementById(isLeft ? 'left-panel-tab' : 'right-panel-tab');
      tab?.classList.toggle('hidden', !target.classList.contains('collapsed'));
      btn.textContent = isLeft
        ? (target.classList.contains('collapsed') ? '▷' : '◁')
        : (target.classList.contains('collapsed') ? '◀' : '▷');
    });
  });

  document.getElementById('left-panel-tab')?.addEventListener('click', () => {
    document.getElementById('left-panel').classList.remove('collapsed');
    document.getElementById('left-panel-tab').classList.add('hidden');
  });
  document.getElementById('right-panel-tab')?.addEventListener('click', () => {
    document.getElementById('right-panel').classList.remove('collapsed');
    document.getElementById('right-panel-tab').classList.add('hidden');
  });

  // ── Tab switching ───────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  // ── 2D/3D Mode Toggle ──────────────────────────────────────
  function _refreshLayersFor3D() {
    // Force fresh data fetch for all active layers so 3D entities render immediately
    MAP3D.whenReady(() => {
      if (STATE.layers.aircraft.active) {
        try { LayerAircraft.refresh?.(); } catch(e) { console.warn('aircraft refresh:', e); }
      }
      if (STATE.layers.ships.active) {
        // Ships: toggle off+on to force _render3D call
        try { LayerShips.toggle(false); LayerShips.toggle(true); } catch(e) {}
      }
      if (STATE.layers.satellites.active) {
        try { LayerSatellites.toggle(false); LayerSatellites.toggle(true); } catch(e) {}
      }
    });
  }

  document.getElementById('btn-mode-toggle')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-mode-toggle');
    const mapContainer = document.getElementById('map-container');
    mapContainer.style.opacity = '0';
    mapContainer.style.transition = 'opacity 0.4s ease';
    await new Promise(r => setTimeout(r, 400));

    if (STATE.mapMode === '2d') {
      STATE.mapMode = '3d';
      btn.textContent = '3D MODE';
      document.body.classList.add('mode-3d');
      MAP2D.enable3D();
    } else {
      STATE.mapMode = '2d';
      btn.textContent = '2D MODE';
      document.body.classList.remove('mode-3d');
      MAP2D.disable3D();
    }

    STATE.savePrefs();
    mapContainer.style.opacity = '1';
    EventBus.emit('sigint:log', { cat: 'UI', msg: `MAP MODE: ${STATE.mapMode.toUpperCase()}` });
  });

  // ── Map Style Select ────────────────────────────────────────
  // (Handled in map2d.js)

  // ── Visual Filter Modes ─────────────────────────────────────
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      STATE.filterMode = mode;
      document.body.className = `mode-${mode}`;
      MAP2D.applyFilterMode(mode);
      STATE.savePrefs();
    });
  });
  // Restore filter mode
  document.body.className = `mode-${STATE.filterMode}`;
  document.querySelector(`.filter-btn[data-mode="${STATE.filterMode}"]`)?.classList.add('active');
  document.querySelector('.filter-btn[data-mode="normal"]')?.classList.remove('active');
  if (STATE.filterMode === 'normal') document.querySelector('.filter-btn[data-mode="normal"]')?.classList.add('active');

  // ── Audio Toggle ────────────────────────────────────────────
  document.getElementById('btn-audio')?.addEventListener('click', () => AUDIO.toggle());
  if (STATE.audioEnabled) AUDIO.toggle(); // restore if was on

  // ── Fullscreen ──────────────────────────────────────────────
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // ── Help Modal ──────────────────────────────────────────────
  document.getElementById('btn-help')?.addEventListener('click', () => {
    document.getElementById('help-modal').classList.remove('hidden');
  });
  document.getElementById('btn-close-help')?.addEventListener('click', () => {
    document.getElementById('help-modal').classList.add('hidden');
  });
  document.getElementById('help-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // ── Alert Banner ────────────────────────────────────────────
  EventBus.on('alert:show', msg => {
    const el = document.getElementById('alert-banner');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 8000);
  });

  // ── Keyboard Shortcuts ──────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch(e.key.toLowerCase()) {
      case 'f': document.getElementById('btn-fullscreen')?.click(); break;
      case 'm': document.getElementById('btn-mode-toggle')?.click(); break;
      case 'a': AUDIO.toggle(); break;
      case '/': e.preventDefault(); document.getElementById('search-input')?.focus(); break;
      case 'escape':
        document.getElementById('help-modal')?.classList.add('hidden');
        document.getElementById('coord-popup')?.classList.add('hidden');
        document.getElementById('camera-popup')?.classList.add('hidden');
        document.getElementById('search-results')?.classList.add('hidden');
        document.getElementById('quick-jump-menu')?.classList.add('hidden');
        break;
      case '1': document.querySelector('.filter-btn[data-mode="normal"]')?.click(); break;
      case '2': document.querySelector('.filter-btn[data-mode="night-vision"]')?.click(); break;
      case '3': document.querySelector('.filter-btn[data-mode="thermal"]')?.click(); break;
      case '4': document.querySelector('.filter-btn[data-mode="crt"]')?.click(); break;
      case '5': document.querySelector('.filter-btn[data-mode="grayscale"]')?.click(); break;
      case '6': document.querySelector('.filter-btn[data-mode="deep-night"]')?.click(); break;
    }
  });

  // ── Layer Toggle Function ───────────────────────────────────
  function _toggleLayer(id) {
    const layer = STATE.layers[id];
    if (!layer) return;
    layer.active = !layer.active;

    const item = document.getElementById(`layer-item-${id}`);
    item?.classList.toggle('active', layer.active);

    // Call the layer module
    const modules = {
      aircraft:    LayerAircraft,
      ships:       LayerShips,
      satellites:  LayerSatellites,
      earthquakes: LayerEarthquakes,
      conflicts:   LayerConflicts,
      cyber:       LayerCyber,
      nofly:       LayerNofly,
      cameras:     LayerCameras,
      maritime:    LayerMaritime,
      news:        LayerNews,
      osmFlow:     LayerOSMFlow,
      // OSIRIS layers
      fires:        LayerFires,
      weather:      LayerWeather,
      war_alerts:   LayerWarAlerts,
      infrastructure: LayerInfrastructure,
      gps_jamming:  LayerGPSJamming,
      day_night:    LayerDayNight,
      live_news_geo: LayerLiveNewsGeo,
    };
    modules[id]?.toggle?.(layer.active);
    STATE.savePrefs();
    EventBus.emit('sigint:log', {
      cat: 'UI',
      msg: `LAYER ${layer.label} ${layer.active ? 'ENABLED' : 'DISABLED'}`,
    });
  }

  // ── Startup boot log ────────────────────────────────────────
  setTimeout(() => {
    EventBus.emit('sigint:log', { cat: 'SYSTEM', msg: 'ALL SYSTEMS NOMINAL — GODEYE OPERATIONAL' });
    EventBus.emit('sigint:log', { cat: 'SYSTEM', msg: `CONNECTED TO ${Object.keys(STATE.layers).length} DATA LAYER MODULES` });
  }, 2000);

  console.log('%cGODEYE ONLINE', 'color:#00ff41;font-size:18px;font-family:monospace;text-shadow:0 0 10px #00ff41;');
  console.log('%cGeospatial Intelligence System v2.0', 'color:#005510;font-family:monospace;');
})();
