// ============================================================
//  GODEYE — Global State & Event Bus
// ============================================================

const STATE = {
  mapMode: localStorage.getItem('wv_mapMode') || '2d',
  center:  { lat: CONFIG.DEFAULT_LAT, lng: CONFIG.DEFAULT_LNG },
  zoom:    CONFIG.DEFAULT_ZOOM,
  filterMode: 'normal',
  audioEnabled: false,

  layers: {
    // ── Original layers ──────────────────────────────────────
    aircraft:   { active: true,  count: 0, online: false, label: 'AIR TRAFFIC',      icon: '✈' },
    ships:      { active: true,  count: 0, online: false, label: 'SHIP TRACKING',    icon: '⛴' },
    satellites: { active: true,  count: 0, online: true,  label: 'SATELLITES',       icon: '🛰' },
    earthquakes:{ active: true,  count: 0, online: false, label: 'SEISMIC / EONET',  icon: '🌍' },
    conflicts:  { active: true,  count: 0, online: false, label: 'CONFLICT ZONES',   icon: '⚔' },
    cyber:      { active: true,  count: 0, online: false, label: 'CYBER THREATS',    icon: '🕷' },
    nofly:      { active: true,  count: 0, online: false, label: 'NO-FLY ZONES',     icon: '🚫' },
    cameras:    { active: true,  count: 0, online: false, label: 'CCTV CAMERAS',     icon: '📹' },
    maritime:   { active: true,  count: 0, online: true,  label: 'MARITIME LANES',   icon: '🗺' },
    news:       { active: true,  count: 0, online: false, label: 'NEWS HEATMAP',     icon: '📰' },
    osmFlow:    { active: true,  count: 0, online: true,  label: 'VEHICLE FLOW',     icon: '🚗' },
    // ── New OSIRIS layers ─────────────────────────────────────
    fires:      { active: false, count: 0, online: false, label: 'ACTIVE WILDFIRES', icon: '🔥' },
    weather:    { active: false, count: 0, online: false, label: 'SEVERE WEATHER',   icon: '🌪' },
    war_alerts: { active: false, count: 0, online: true,  label: 'WAR ALERTS',       icon: '💥' },
    infrastructure:{ active: false, count: 0, online: true, label: 'INFRASTRUCTURE', icon: '☢' },
    gps_jamming:{ active: false, count: 0, online: true,  label: 'GPS JAMMING',      icon: '📡' },
    day_night:  { active: false, count: 0, online: true,  label: 'DAY/NIGHT CYCLE',  icon: '🌙' },
    live_news_geo:{ active: false, count: 0, online: false, label: 'LIVE NEWS DOTS', icon: '📺' },
    balloons:   { active: false, count: 0, online: false, label: 'BALLOONS',         icon: '🎈' },
  },

  data: {
    aircraft:    [],
    ships:       {},
    satellites:  [],
    conflicts:   [],
    earthquakes: [],
    cyber:       [],
    cameras:     [],
    newsArticles:[],
    sigintLog:   [],
    // New
    fires:       [],
    weather:     [],
    markets:     [],
    spaceWeather: null,
    liveNewsGeo: [],
    alerts:      [],
  },

  counts: {
    aircraft: 0, ships: 0, satellites: 0,
    conflicts: 0, earthquakes: 0, news: 0, cyber: 0,
    fires: 0, weather: 0,
  },

  drawn:          [],
  selectedCoord:  null,
  cityIntelTarget:null,
  currentTool:    'none',

  history: JSON.parse(localStorage.getItem('wv_search_history') || '[]'),

  threatLevel: 1,  // 1-5 DEFCON-style

  _feedCount: 0,
};

// ── Reactive layer state helpers ────────────────────────────
STATE.setLayerCount = function(id, n) {
  if (!this.layers[id]) return;
  this.layers[id].count = n;
  this.counts[id] = n;
  EventBus.emit('layer:count', { id, count: n });
  EventBus.emit('ticker:update', null);
};

STATE.setLayerOnline = function(id, online) {
  if (!this.layers[id]) return;
  this.layers[id].online = online;
  EventBus.emit('layer:online', { id, online });
};

STATE.savePrefs = function() {
  const prefs = {};
  Object.keys(this.layers).forEach(id => prefs[id] = this.layers[id].active);
  prefs.mapMode = this.mapMode;
  prefs.audioEnabled = this.audioEnabled;
  prefs.filterMode = this.filterMode;
  localStorage.setItem('wv_prefs', JSON.stringify(prefs));
};

STATE.loadPrefs = function() {
  try {
    const prefs = JSON.parse(localStorage.getItem('wv_prefs') || '{}');
    Object.keys(this.layers).forEach(id => {
      if (prefs[id] !== undefined) this.layers[id].active = prefs[id];
    });
    if (prefs.mapMode)      this.mapMode      = prefs.mapMode;
    if (prefs.filterMode)   this.filterMode   = prefs.filterMode;
    if (prefs.audioEnabled) this.audioEnabled = prefs.audioEnabled;
  } catch(e) {}
};

STATE.addHistory = function(q) {
  this.history = [q, ...this.history.filter(h => h !== q)].slice(0, 10);
  localStorage.setItem('wv_search_history', JSON.stringify(this.history));
};

STATE.updateThreatLevel = function() {
  let score = 0;
  score += Math.min(STATE.counts.conflicts   / 10, 2);
  score += Math.min(STATE.counts.earthquakes / 5,  1);
  score += Math.min(STATE.counts.cyber       / 50, 1);
  score += Math.min((STATE.counts.fires||0)  / 20, 0.5);
  const lvl = Math.max(1, Math.min(5, Math.ceil(score)));
  if (lvl !== STATE.threatLevel) {
    STATE.threatLevel = lvl;
    EventBus.emit('threat:update', lvl);
  }
};

// ── Event Bus ────────────────────────────────────────────────
const EventBus = (() => {
  const _l = {};
  return {
    on(ev, cb)   { (_l[ev] = _l[ev] || []).push(cb); },
    off(ev, cb)  { if (_l[ev]) _l[ev] = _l[ev].filter(f => f !== cb); },
    emit(ev, d)  { (_l[ev] || []).forEach(cb => { try { cb(d); } catch(e){} }); },
  };
})();
