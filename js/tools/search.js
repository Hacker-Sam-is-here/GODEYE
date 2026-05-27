// ============================================================
//  GODEYE — Search & Navigation
// ============================================================
const SearchTool = (() => {
  const NOMINATIM = 'https://nominatim.openstreetmap.org';

  function _buildQuickJump() {
    const menu = document.getElementById('quick-jump-menu');
    if (!menu) return;
    menu.innerHTML = HOTSPOTS.map(h =>
      `<div class="dropdown-item" data-lat="${h.lat}" data-lng="${h.lng}" data-zoom="${h.zoom}">
        ${h.name}
        <div class="item-sub">${h.lat.toFixed(1)}°, ${h.lng.toFixed(1)}°</div>
      </div>`).join('');

    menu.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        const zoom = parseInt(el.dataset.zoom);
        const name = el.textContent.trim().split('\n')[0];
        _flyTo(lat, lng, zoom);
        menu.classList.add('hidden');
        document.getElementById('search-input').value = name;
        EventBus.emit('cityintel:open', { name, lat, lng });
      });
    });

    document.getElementById('btn-quick-jump')?.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
      document.getElementById('search-results').classList.add('hidden');
    });
  }

  async function _search(query) {
    const q = query.trim();
    if (!q) return;

    STATE.addHistory(q);

    // Detect lat/lng pair
    const coordMatch = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      _flyTo(lat, lng, 12);
      EventBus.emit('coord:lookup', { lat, lng });
      return;
    }

    // Detect IP address
    if (/^\d+\.\d+\.\d+\.\d+$/.test(q)) {
      try {
        const data = await CORS.fetchJSON(`http://ip-api.com/json/${q}`);
        if (data.status === 'success') {
          _flyTo(data.lat, data.lon, 8, `IP: ${q} — ${data.city}, ${data.country}`);
          EventBus.emit('cityintel:open', { name: data.city, country: data.country, lat: data.lat, lng: data.lon });
          return;
        }
      } catch(e) {}
    }

    // Detect NORAD ID (pure number, likely satellite)
    if (/^\d{5}$/.test(q)) {
      const sat = STATE.data.satellites.find(s => s.properties.noradId == parseInt(q));
      if (sat) {
        const [lng, lat] = sat.geometry.coordinates;
        return _flyTo(lat, lng, 4, `🛰 ${sat.properties.name} — NORAD ${q}`);
      }
    }

    // Detect MMSI (9-digit number)
    if (/^\d{9}$/.test(q)) {
      const vessel = STATE.data.ships[q];
      if (vessel && vessel.lat) return _flyTo(vessel.lat, vessel.lng, 10, `⛴ ${vessel.name || q}`);
    }

    // Detect ICAO24 (6 hex chars)
    if (/^[0-9a-fA-F]{6}$/.test(q)) {
      const ac = STATE.data.aircraft.find(f => f.properties.icao24?.toLowerCase() === q.toLowerCase());
      if (ac) {
        const [lng, lat] = ac.geometry.coordinates;
        return _flyTo(lat, lng, 8, `✈ ${ac.properties.callsign || q}`);
      }
    }

    // Geocode via Nominatim
    try {
      const data = await CORS.fetchJSON(`${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&limit=5`);
      if (!data.length) { _showResults([]); return; }
      if (data.length === 1) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const name = data[0].display_name.split(',')[0];
        _flyTo(lat, lon, 10, data[0].display_name);
        EventBus.emit('cityintel:open', { name, lat, lng: lon });
      } else {
        _showResults(data);
      }
    } catch(e) {}
  }

  function _showResults(results) {
    const box = document.getElementById('search-results');
    if (!box) return;
    if (!results.length) {
      box.innerHTML = '<div class="dropdown-item" style="color:#005510;">NO RESULTS FOUND</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = results.map(r =>
      `<div class="dropdown-item" data-lat="${r.lat}" data-lng="${r.lon}">
        ${r.display_name.split(',')[0]}
        <div class="item-sub">${r.display_name.split(',').slice(1,3).join(',').trim()}</div>
      </div>`).join('');
    box.classList.remove('hidden');

    box.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        const name = el.textContent.trim().split('\n')[0];
        _flyTo(lat, lng, 10);
        box.classList.add('hidden');
        document.getElementById('search-input').value = name;
        EventBus.emit('cityintel:open', { name, lat, lng });
      });
    });
  }

  function _flyTo(lat, lng, zoom = 10, label = '') {
    if (STATE.mapMode === '2d') {
      MAP2D.flyTo(lat, lng, zoom);
    } else {
      const altM = Math.max(500, 40000000 / Math.pow(2, zoom));
      MAP3D.flyTo(lat, lng, altM);
    }
    STATE.center = { lat, lng };
    if (label) EventBus.emit('sigint:log', { cat: 'NAV', msg: `FLY-TO: ${label} → ${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }

  return {
    init() {
      _buildQuickJump();

      const input = document.getElementById('search-input');
      const results = document.getElementById('search-results');

      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          _search(input.value);
          results.classList.add('hidden');
        }
        if (e.key === 'Escape') { results.classList.add('hidden'); document.getElementById('quick-jump-menu').classList.add('hidden'); }
      });

      // Close dropdowns on outside click
      document.addEventListener('click', e => {
        if (!e.target.closest('.search-wrap')) {
          results?.classList.add('hidden');
          document.getElementById('quick-jump-menu')?.classList.add('hidden');
        }
      });
    },

    flyTo: (lat, lng, zoom, label) => {
      if (STATE.mapMode === '2d') MAP2D.flyTo(lat, lng, zoom || 10);
      else MAP3D.flyTo(lat, lng, Math.max(500, 40000000 / Math.pow(2, zoom || 10)));
    },
  };
})();
