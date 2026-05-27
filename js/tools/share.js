// ============================================================
//  GODEYE — Tool: Share / URL State
// ============================================================
const ShareTool = (() => {

  function _encodeState() {
    const p = new URLSearchParams();
    p.set('lat',  STATE.center.lat.toFixed(4));
    p.set('lng',  STATE.center.lng.toFixed(4));
    p.set('zoom', STATE.zoom.toFixed(2));
    p.set('mode', STATE.mapMode);
    const activeLayers = Object.entries(STATE.layers)
      .filter(([, v]) => v.active).map(([k]) => k).join(',');
    if (activeLayers) p.set('layers', activeLayers);
    return `${location.origin}${location.pathname}?${p.toString()}`;
  }

  function _decodeAndApply() {
    const p = new URLSearchParams(location.search);
    const lat  = parseFloat(p.get('lat'));
    const lng  = parseFloat(p.get('lng'));
    const zoom = parseFloat(p.get('zoom'));
    const mode = p.get('mode');
    const layersParam = p.get('layers');

    if (!isNaN(lat) && !isNaN(lng)) {
      STATE.center = { lat, lng };
      if (!isNaN(zoom)) STATE.zoom = zoom;
      // Fly after map init
      setTimeout(() => {
        if (STATE.mapMode === '2d' && MAP2D.map) {
          MAP2D.flyTo(lat, lng, isNaN(zoom) ? 6 : zoom);
        }
      }, 2500);
    }

    if (layersParam) {
      const active = new Set(layersParam.split(','));
      Object.keys(STATE.layers).forEach(id => {
        STATE.layers[id].active = active.has(id);
      });
    }
  }

  function _copyToClipboard() {
    const url = _encodeState();
    navigator.clipboard?.writeText(url).then(() => {
      const btn = document.getElementById('btn-share');
      if (!btn) return;
      const orig = btn.textContent;
      btn.textContent = '✓ COPIED!';
      btn.style.borderColor = 'var(--green)';
      setTimeout(() => { btn.textContent = orig; btn.style.borderColor = ''; }, 2000);
      EventBus.emit('sigint:log', { cat: 'SHARE', msg: 'VIEW LINK COPIED TO CLIPBOARD' });
    }).catch(() => {
      prompt('Copy this URL:', url);
    });
  }

  // Keep URL updated as view changes
  EventBus.on('map:viewchange', () => {
    if (typeof history === 'undefined') return;
    const url = _encodeState();
    history.replaceState(null, '', url);
  });

  return {
    init() {
      _decodeAndApply();
      const btn = document.getElementById('btn-share');
      if (btn) btn.addEventListener('click', _copyToClipboard);
    },
    copyToClipboard: _copyToClipboard,
    encodeState: _encodeState,
  };
})();
