// ============================================================
//  GODEYE — OSINT Engine  (ANU API + Workers fallback)
// ============================================================
const AnuOSINT = (() => {
  const PRIMARY  = 'https://anuapi.netlify.app/.netlify/functions/api';
  const FALLBACK = 'https://api.b77bf911.workers.dev';

  const ENDPOINTS = {
    mobile:  { param:'number',       label:'MOBILE NUMBER',        cat:'identity',  placeholder:'9876543210' },
    aadhaar: { param:'id',           label:'AADHAAR ID',           cat:'identity',  placeholder:'1234 5678 9012' },
    pan:     { param:'pan',          label:'PAN CARD',             cat:'identity',  placeholder:'ABCDE1234F' },
    email:   { param:'address',      label:'EMAIL ADDRESS',        cat:'identity',  placeholder:'user@example.com' },
    rashan:  { param:'aadhaar',      label:'RATION CARD',          cat:'identity',  placeholder:'1234 5678 9012' },
    gst:     { param:'number',       label:'GST NUMBER',           cat:'financial', placeholder:'27AAAPL0742H1Z4' },
    upi:     { param:'id',           label:'UPI ID',               cat:'financial', placeholder:'name@upi' },
    upi2:    { param:'id',           label:'UPI ID (v2)',          cat:'financial', placeholder:'name@upi' },
    ifsc:    { param:'code',         label:'BANK IFSC CODE',       cat:'financial', placeholder:'SBIN0000001' },
    gas:     { param:'num',          label:'GAS CONNECTION',       cat:'financial', placeholder:'Consumer number' },
    vehicle: { param:'registration', label:'VEHICLE REGISTRATION', cat:'vehicle',   placeholder:'MH12AB1234' },
    fastag:  { param:'vrn',          label:'FASTAG / VRN',         cat:'vehicle',   placeholder:'MH12AB1234' },
    challan: { param:'vrn',          label:'TRAFFIC CHALLAN',      cat:'vehicle',   placeholder:'MH12AB1234' },
    v3:      { param:'vrn',          label:'VEHICLE (Backup)',      cat:'vehicle',   placeholder:'MH12AB1234' },
    telegram:{ param:'user',         label:'TELEGRAM USER',        cat:'social',    placeholder:'@username' },
    Number:  { param:'Number',       label:'NUMBER INTEL',         cat:'social',    placeholder:'Phone/ID number' },
    v2:      { param:'query',        label:'GENERAL QUERY',        cat:'social',    placeholder:'Any query string' },
    photo:   { param:'vi',           label:'PHOTO LOOKUP',         cat:'media',     placeholder:'VI / ID number' },
    v4:      { param:'vi',           label:'VI PHOTO',             cat:'media',     placeholder:'VI number' },
  };

  const CATS = {
    identity:  { label:'IDENTITY INTEL',   color:'#00e5ff' },
    financial: { label:'FINANCIAL INTEL',  color:'#ffd600' },
    vehicle:   { label:'VEHICLE INTEL',    color:'#76ff03' },
    social:    { label:'SOCIAL / TELECOM', color:'#ff6d00' },
    media:     { label:'MEDIA / FILES',    color:'#e040fb' },
  };

  // ── Pretty field labels ──────────────────────────────────────
  const FIELD_LABELS = {
    regNo:'REG NO', vehicleNumber:'REG NO', vehicleManufacturerName:'MANUFACTURER',
    model:'MODEL', variant:'VARIANT', vehicleColour:'COLOUR', type:'FUEL TYPE',
    regDate:'REG DATE', regAuthority:'RTO', rcExpiryDate:'RC EXPIRY',
    vehicleInsuranceCompanyName:'INSURER', vehicleInsuranceUpto:'INS VALID TILL',
    vehicleInsurancePolicyNumber:'POLICY NO', chassis:'CHASSIS NO', engine:'ENGINE NO',
    vehicleCubicCapacity:'ENGINE CC', vehicleSeatCapacity:'SEATS',
    presentAddress:'ADDRESS', isCommercial:'COMMERCIAL', financed:'FINANCED',
    blacklistDetails:'BLACKLIST',
    NAME:'NAME', fname:'FATHER NAME', ADDRESS:'ADDRESS', MOBILE:'MOBILE',
    circle:'CIRCLE / OPERATOR', alt:'ALT NUMBER', email:'EMAIL', id:'USER ID',
    BANK:'BANK', BRANCH:'BRANCH', ADDRESS_IFSC:'ADDRESS', STATE:'STATE',
    CITY:'CITY', DISTRICT:'DISTRICT', IFSC:'IFSC CODE', BANKCODE:'BANK CODE',
    MICR:'MICR', UPI:'UPI ENABLED', RTGS:'RTGS', NEFT:'NEFT', IMPS:'IMPS',
    fullName:'FULL NAME', legalName:'LEGAL NAME', tradeName:'TRADE NAME',
    status:'STATUS', taxPayerType:'TAXPAYER TYPE', stateJurisdiction:'JURISDICTION',
    balance:'BALANCE', bank:'BANK', vehicle_number:'VEHICLE NO',
  };

  function _label(key) {
    return FIELD_LABELS[key] || key.replace(/([A-Z])/g,' $1').replace(/_/g,' ').toUpperCase().trim();
  }

  // ── Sanitize messy Indian addresses ──────────────────────────
  function _cleanAddress(raw) {
    return raw
      .replace(/S\/O\s+[^!,]+/gi, '')
      .replace(/D\/O\s+[^!,]+/gi, '')
      .replace(/W\/O\s+[^!,]+/gi, '')
      .replace(/C\/O\s+[^!,]+/gi, '')
      .replace(/PLOT\s+NO[-\s]*[\w\/]+/gi, '')
      .replace(/KH\s+NO[-\s]*[\w\/]+/gi, '')
      .replace(/GALI\s+NO[-\s]*\w+/gi, '')
      .replace(/SR\s+NO\s+\d+/gi, '')
      .replace(/!+/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
  }

  // ── Extract city / state / pincode tokens ─────────────────────
  function _addressTokens(raw) {
    var pin    = (raw.match(/\b\d{6}\b/) || [])[0] || '';
    var states = ['Delhi','Maharashtra','Karnataka','Tamil Nadu','Uttar Pradesh','Rajasthan',
                  'West Bengal','Gujarat','Punjab','Haryana','Bihar','Telangana','Kerala',
                  'Madhya Pradesh','Andhra Pradesh','Odisha','Assam','Jharkhand','Uttarakhand'];
    var state  = states.find(function(s){ return raw.toLowerCase().includes(s.toLowerCase()); }) || '';
    var parts  = raw.split(/!+|,/).map(function(p){ return p.trim(); }).filter(Boolean);
    // Use last 3 non-numeric parts as city-level candidates
    var city   = parts.filter(function(p){ return !/^\d+$/.test(p); }).slice(-3).join(', ');
    return { pin: pin, state: state, city: city };
  }

  // ── Single Nominatim call ─────────────────────────────────────
  async function _nom(q) {
    var r = await fetch(
      'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1',
      { headers: { 'Accept-Language':'en', 'User-Agent':'OSINT-Dashboard/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    return r.json();
  }

  // ── Geocode with 4-stage progressive fallback → fly map ───────
  async function _geocodeAndFly(address) {
    if (!address) return;
    var tok     = _addressTokens(address);
    var cleaned = _cleanAddress(address);
    var hits    = [];

    // Stage 1: full cleaned address
    if (!hits.length && cleaned.length > 5)
      hits = await _nom(cleaned + ', India').catch(function(){ return []; });

    // Stage 2: city + state
    if (!hits.length && tok.city)
      hits = await _nom(tok.city + (tok.state ? ', ' + tok.state : '') + ', India').catch(function(){ return []; });

    // Stage 3: pincode only
    if (!hits.length && tok.pin)
      hits = await _nom(tok.pin + ', India').catch(function(){ return []; });

    // Stage 4: state only (last resort, at least puts map in the right region)
    if (!hits.length && tok.state)
      hits = await _nom(tok.state + ', India').catch(function(){ return []; });

    if (!hits.length) {
      EventBus.emit('sigint:log', { cat:'OSINT', msg:'GEOCODE: Could not resolve — ' + (tok.city || address).slice(0,40) });
      return;
    }

    var lat  = parseFloat(hits[0].lat);
    var lng  = parseFloat(hits[0].lon);
    var name = hits[0].display_name;
    console.log('[OSINT] Fly to:', lat, lng, name);
    MAP2D.flyTo(lat, lng, tok.pin ? 13 : tok.city ? 11 : 7);
    EventBus.emit('sigint:log', { cat:'OSINT', msg:'GEO-LOCATED \u2192 ' + name.slice(0,55) });
  }

  // Address row keys that should be clickable
  var ADDRESS_KEYS = ['ADDRESS','PRESENT ADDRESS','PERMANENT ADDRESS','BRANCH ADDRESS','CITY','DISTRICT'];



  // ── Fetch with primary → fallback ────────────────────────────
  async function _fetch(endpoint, value) {
    const def = ENDPOINTS[endpoint];
    const path = '/' + endpoint + '?' + def.param + '=' + encodeURIComponent(value);

    try {
      const r = await fetch(PRIMARY + path, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch(e1) {
      // Fallback to Cloudflare Workers
      const r2 = await fetch(FALLBACK + path, { signal: AbortSignal.timeout(20000) });
      return await r2.json();
    }
  }

  // ── Query entry point ────────────────────────────────────────
  async function _query(endpoint, value) {
    const def = ENDPOINTS[endpoint];
    if (!def || !value) return;
    const out = document.getElementById('anu-output');
    if (out) out.innerHTML = '<div class="anu-loading">&#9654; QUERYING ' + def.label + '...</div>';

    try {
      const data = await _fetch(endpoint, value);
      _render(out, endpoint, def, value, data);
      EventBus.emit('sigint:log', { cat:'OSINT', msg: def.label + ': ' + value });
    } catch(e) {
      if (out) out.innerHTML = '<div class="anu-error">&#9654; FAILED: ' + e.message + '</div>';
    }
  }

  // ── Render ───────────────────────────────────────────────────
  function _render(el, endpoint, def, input, data) {
    if (!el) return;
    var ok = data && data.success;
    var d  = data && data.data;

    var html = '<div class="anu-result-header">'
      + '<span class="anu-status-' + (ok ? 'ok' : 'err') + '">' + (ok ? '&#10003;' : '&#10007;') + '</span>'
      + '<span class="anu-result-title">' + def.label + '</span>'
      + '<span class="anu-result-input">' + input + '</span>'
      + '</div>';

    if (!ok || !d) {
      el.innerHTML = html + '<div class="anu-error">' + ((data && data.message) || 'No data returned') + '</div>';
      return;
    }

    html += _renderData(endpoint, d);
    el.innerHTML = html;
  }

  function _renderData(endpoint, d) {
    // ── Vehicle ──────────────────────────────────────────────
    if (endpoint === 'vehicle' && d.car_info) {
      var ci = d.car_info;
      var fields = [
        ['REG NO',        ci.vehicleNumber],
        ['OWNER',         ci.customerDetails && ci.customerDetails.fullName],
        ['MANUFACTURER',  ci.vehicleManufacturerName],
        ['MODEL',         ci.model],
        ['VARIANT',       ci.variant],
        ['COLOUR',        ci.vehicleColour],
        ['FUEL',          ci.type],
        ['ENGINE CC',     ci.vehicleCubicCapacity],
        ['CHASSIS NO',    ci.chassis],
        ['ENGINE NO',     ci.engine],
        ['REG DATE',      ci.regDate],
        ['RC EXPIRY',     ci.rcExpiryDate],
        ['RTO',           ci.regAuthority],
        ['RTO CODE',      ci.rtoCode],
        ['INSURER',       ci.vehicleInsuranceCompanyName],
        ['INS VALID TILL',ci.vehicleInsuranceUpto],
        ['POLICY NO',     ci.vehicleInsurancePolicyNumber],
        ['SEATS',         ci.vehicleSeatCapacity],
        ['FINANCED',      ci.financed],
        ['ADDRESS',       ci.presentAddress],
        ['BLACKLIST',     ci.blacklistDetails && ci.blacklistDetails.length ? '&#9888; YES' : '&#10003; CLEAR'],
      ];
      return _table(fields);
    }

    // ── IFSC ─────────────────────────────────────────────────
    if (endpoint === 'ifsc') {
      var fields = [
        ['BANK',     d.BANK],
        ['BRANCH',   d.BRANCH],
        ['IFSC',     d.IFSC],
        ['MICR',     d.MICR],
        ['ADDRESS',  d.ADDRESS],
        ['CITY',     d.CITY],
        ['DISTRICT', d.DISTRICT],
        ['STATE',    d.STATE],
        ['BANK CODE',d.BANKCODE],
        ['UPI',      d.UPI  ? '&#10003; YES' : 'NO'],
        ['RTGS',     d.RTGS ? '&#10003; YES' : 'NO'],
        ['NEFT',     d.NEFT ? '&#10003; YES' : 'NO'],
        ['IMPS',     d.IMPS ? '&#10003; YES' : 'NO'],
        ['SWIFT',    d.SWIFT || 'N/A'],
      ];
      return _table(fields);
    }

    // ── Mobile (array of records) ────────────────────────────
    if (endpoint === 'mobile') {
      var items = Array.isArray(d) ? d : (Array.isArray(d.data) ? d.data : (d.result ? [d.result] : null));
      if (items && items.length) {
        // Deduplicate by NAME
        var seen = {}, unique = [];
        items.forEach(function(it) {
          var k = (it.NAME || '') + (it.MOBILE || '');
          if (!seen[k]) { seen[k] = true; unique.push(it); }
        });
        return unique.map(function(it, idx) {
          var fields = [
            ['NAME',       it.NAME],
            ['FATHER',     it.fname],
            ['MOBILE',     it.MOBILE],
            ['ALT NUMBER', it.alt],
            ['EMAIL',      it.email],
            ['ADDRESS',    it.ADDRESS],
            ['OPERATOR',   it.circle],
            ['USER ID',    it.id],
          ];
          return '<div class="anu-card-header">RECORD ' + (idx+1) + ' / ' + unique.length + '</div>' + _table(fields);
        }).join('');
      }
    }

    // ── GST ──────────────────────────────────────────────────
    if (endpoint === 'gst') {
      var gd = d.data || d;
      if (Array.isArray(gd) && gd.length) gd = gd[0];
      if (gd && typeof gd === 'object') {
        var fields = Object.entries(gd).filter(function(kv){ return kv[1] && kv[1] !== ''; }).map(function(kv){ return [_label(kv[0]), kv[1]]; });
        return _table(fields);
      }
    }

    // ── Telegram ─────────────────────────────────────────────
    if (endpoint === 'telegram') {
      var td = d.data || d;
      if (td && typeof td === 'object') {
        var fields = [
          ['USERNAME',   td.username],
          ['FIRST NAME', td.first_name],
          ['LAST NAME',  td.last_name],
          ['PHONE',      td.phone],
          ['ID',         td.id],
          ['BIO',        td.bio],
          ['PREMIUM',    td.is_premium ? 'YES' : 'NO'],
          ['VERIFIED',   td.is_verified ? 'YES' : 'NO'],
          ['SCAM',       td.is_scam ? '&#9888; YES' : 'NO'],
        ];
        return _table(fields);
      }
    }

    // ── UPI ──────────────────────────────────────────────────
    if (endpoint === 'upi' || endpoint === 'upi2') {
      var ud = d.data || d;
      var items = ud && ud.verify_chumts;
      if (items && items.length) {
        return items.map(function(it) {
          return _table(Object.entries(it).map(function(kv){ return [_label(kv[0]), kv[1]]; }));
        }).join('');
      }
    }

    // ── FASTag ───────────────────────────────────────────────
    if (endpoint === 'fastag') {
      var fd = d.data || d;
      var vd = fd.vehicle_details || {};
      var fields = [
        ['VEHICLE NO', fd.vehicle_number],
        ['BANK',       fd.bank],
        ['BALANCE',    fd.balance != null ? '&#8377; ' + fd.balance : 'N/A'],
        ['MIN RECHARGE',fd.min_recharge != null ? '&#8377; ' + fd.min_recharge : 'N/A'],
        ['MAX RECHARGE',fd.max_recharge != null ? '&#8377; ' + fd.max_recharge : 'N/A'],
        ['MAKE',       vd.make],
        ['MODEL',      vd.model],
        ['COLOUR',     vd.color],
        ['TYPE',       vd.type],
      ];
      return _table(fields);
    }

    // ── Generic fallback: flatten all key-value pairs ─────────
    var flat = _flatten(d);
    var entries = Object.entries(flat).filter(function(kv){ return kv[1] !== null && kv[1] !== ''; }).slice(0, 50);
    if (!entries.length) return '<div class="anu-error">No displayable fields in response</div>';
    return _table(entries.map(function(kv){ return [_label(kv[0].split('.').pop()), kv[1]]; }));
  }

  // ── Table renderer ───────────────────────────────────────────
  function _table(rows) {
    var html = '<div class="anu-table">';
    rows.forEach(function(r) {
      if (!r[1] && r[1] !== 0 && r[1] !== false) return;
      var key = r[0], val = String(r[1]);
      var isAddr = ADDRESS_KEYS.indexOf(key.toUpperCase()) !== -1 && val.length > 4;
      var valHtml = isAddr
        ? '<span class="anu-addr-link" data-addr="' + val.replace(/"/g,'&quot;') + '" title="Click to locate on map">&#128205; ' + val + '</span>'
        : val;
      html += '<div class="anu-row"><span class="anu-key">' + key + '</span><span class="anu-val">' + valHtml + '</span></div>';
    });
    return html + '</div>';
  }

  // ── Deep flatten (object → flat key/value) ───────────────────
  function _flatten(obj, prefix, out) {
    prefix = prefix || '';
    out = out || {};
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) {
      obj.slice(0,3).forEach(function(item, i) { _flatten(item, prefix + '[' + i + ']', out); });
      return out;
    }
    Object.entries(obj).forEach(function(kv) {
      var k = kv[0], v = kv[1];
      var key = prefix ? prefix + '.' + k : k;
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] !== 'object') out[key] = v.join(', ');
        else v.slice(0,3).forEach(function(item,i){ _flatten(item, key+'['+i+']', out); });
      } else if (v && typeof v === 'object') {
        _flatten(v, key, out);
      } else if (v !== null && v !== undefined && v !== '') {
        out[key] = v;
      }
    });
    return out;
  }

  // ── Build UI ─────────────────────────────────────────────────
  function _buildUI() {
    var container = document.getElementById('tab-anu-osint');
    if (!container) return;

    var optGroups = '';
    Object.entries(CATS).forEach(function(cv) {
      var catKey = cv[0], cat = cv[1];
      var opts = Object.entries(ENDPOINTS)
        .filter(function(ev){ return ev[1].cat === catKey; })
        .map(function(ev){ return '<option value="' + ev[0] + '">' + ev[1].label + '</option>'; })
        .join('');
      optGroups += '<optgroup label="' + cat.label + '" style="color:' + cat.color + '">' + opts + '</optgroup>';
    });

    var quickBtns = [
      {ep:'mobile',  val:'9876543210',  label:'Mobile'},
      {ep:'vehicle', val:'MH12AB1234',  label:'Vehicle'},
      {ep:'ifsc',    val:'SBIN0000001', label:'IFSC'},
      {ep:'telegram',val:'@durov',      label:'Telegram'},
      {ep:'upi',     val:'paytm@upi',   label:'UPI'},
    ].map(function(b){
      return '<button class="anu-quick action-btn" data-ep="'+b.ep+'" data-val="'+b.val+'">'+b.label+'</button>';
    }).join('');

    var catPills = Object.entries(CATS).map(function(cv){
      return '<button class="anu-cat-btn action-btn" data-cat="'+cv[0]+'" style="font-size:0.6rem;padding:2px 6px;color:'+cv[1].color+';border-color:'+cv[1].color+'40">'+cv[1].label+'</button>';
    }).join('');

    container.innerHTML = [
      '<div class="feed-header" style="flex-shrink:0">',
        '<span class="feed-title">OSINT ENGINE</span>',
        '<span style="font-size:0.6rem;color:#005510">PRIMARY: ANUAPI &bull; FALLBACK: CF WORKERS</span>',
      '</div>',
      '<div style="padding:8px 8px 0;flex-shrink:0">',
        '<select id="anu-endpoint-sel" style="width:100%;background:rgba(0,10,0,0.85);border:1px solid var(--border);color:var(--green);font-family:var(--font);font-size:0.72rem;padding:5px 8px;margin-bottom:6px;border-radius:3px">',
          optGroups,
        '</select>',
        '<div style="display:flex;gap:4px;margin-bottom:6px">',
          '<input id="anu-input" type="text" placeholder="Enter query..." style="flex:1;background:rgba(0,10,0,0.85);border:1px solid var(--border);color:var(--green);font-family:var(--font);font-size:0.73rem;padding:5px 8px;border-radius:3px;outline:none">',
          '<button id="anu-run-btn" class="action-btn" style="padding:5px 14px;font-size:0.73rem;font-weight:bold">&#9654; RUN</button>',
        '</div>',
        '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px">'+quickBtns+'</div>',
        '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">'+catPills+'</div>',
      '</div>',
      '<div id="anu-scroll" style="flex:1;overflow-y:auto;padding:6px 8px">',
        '<div id="anu-output">',
          '<div style="color:#005510;font-size:0.7rem;line-height:2">',
            '&#9654; OSINT ENGINE READY<br>',
            'VEHICLE &mdash; full RC + owner data<br>',
            'MOBILE &nbsp;&mdash; name, address, carrier<br>',
            'IFSC &nbsp;&nbsp;&mdash; bank + branch info<br>',
            'GST &nbsp;&nbsp;&nbsp;&mdash; company registration<br>',
            'CHALLAN &mdash; traffic violations<br>',
            'FASTAG &nbsp;&mdash; toll + balance info<br>',
            'UPI &nbsp;&nbsp;&nbsp;&mdash; payment ID lookup<br>',
            '<span style="color:#00bcd4">&#128205; Click any address to fly map there</span>',
          '</div>',
        '</div>',
      '</div>',
      '<div style="padding:4px 8px;border-top:1px solid var(--border);flex-shrink:0;font-size:0.58rem;color:#005510;text-align:center">',
        'ANUAPI v5.2 &bull; 19 ENDPOINTS',
      '</div>',
    ].join('');

    var sel    = container.querySelector('#anu-endpoint-sel');
    var input  = container.querySelector('#anu-input');
    var runBtn = container.querySelector('#anu-run-btn');

    sel.addEventListener('change', function(){
      var def = ENDPOINTS[sel.value];
      if (def) input.placeholder = def.placeholder || 'Enter query...';
    });

    function run(){
      var val = input.value.trim();
      if (!val){ input.focus(); return; }
      _query(sel.value, val);
    }

    runBtn.addEventListener('click', run);
    input.addEventListener('keydown', function(e){ if(e.key==='Enter') run(); });

    // Delegate address-click geocoding
    container.addEventListener('click', function(e) {
      var t = e.target.closest('.anu-addr-link');
      if (!t) return;
      var addr = t.dataset.addr;
      if (!addr) return;
      var orig = addr;
      t.style.color = 'var(--amber)';
      t.innerHTML = '&#128205; LOCATING...';
      _geocodeAndFly(orig).finally(function(){
        t.innerHTML = '&#128205; ' + orig;
        t.style.color = '';
      });
    });
    container.querySelectorAll('.anu-quick').forEach(function(btn){
      btn.addEventListener('click', function(){
        sel.value   = btn.dataset.ep;
        input.value = btn.dataset.val;
        var def = ENDPOINTS[btn.dataset.ep];
        if(def) input.placeholder = def.placeholder || '';
        run();
      });
    });

    container.querySelectorAll('.anu-cat-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var first = Object.entries(ENDPOINTS).find(function(ev){ return ev[1].cat===btn.dataset.cat; });
        if(first){ sel.value=first[0]; input.placeholder=first[1].placeholder||''; input.focus(); }
      });
    });
  }

  // ── CSS ──────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('anu-styles')) return;
    var s = document.createElement('style');
    s.id = 'anu-styles';
    s.textContent = [
      '.anu-result-header{display:flex;align-items:center;gap:8px;padding:6px 0 6px;border-bottom:1px solid var(--border);margin-bottom:8px}',
      '.anu-status-ok{color:#00e676;font-size:1rem}',
      '.anu-status-err{color:#f44336;font-size:1rem}',
      '.anu-result-title{color:var(--amber);font-size:0.72rem;font-weight:bold;flex:1}',
      '.anu-result-input{color:#555;font-size:0.62rem}',
      '.anu-table{display:flex;flex-direction:column;gap:1px;margin-bottom:10px}',
      '.anu-row{display:flex;gap:0;border-bottom:1px solid rgba(0,255,65,0.06);min-height:22px}',
      '.anu-key{color:#00bcd4;width:130px;min-width:130px;font-size:0.63rem;letter-spacing:0.04em;padding:3px 6px 3px 0;line-height:1.5;text-transform:uppercase}',
      '.anu-val{color:var(--green);font-size:0.7rem;padding:3px 0;line-height:1.5;word-break:break-word;flex:1}',
      '.anu-card-header{color:var(--amber);font-size:0.65rem;padding:6px 0 3px;border-top:1px solid var(--border);margin-top:6px;letter-spacing:0.08em}',
      '.anu-loading{color:var(--amber);font-size:0.72rem;padding:8px 0;animation:blink 1s infinite}',
      '.anu-error{color:#f44336;font-size:0.72rem;padding:8px 0}',
      '.anu-quick{font-size:0.65rem!important;padding:2px 8px!important}',
      '.anu-addr-link{cursor:pointer;color:#00bcd4;text-decoration:underline dotted;transition:color 0.2s}',
      '.anu-addr-link:hover{color:#00e5ff;text-shadow:0 0 6px #00e5ff80}',
      '@keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}',
    ].join('');
    document.head.appendChild(s);
  }

  return {
    init: function(){
      _injectCSS();
      _buildUI();
      EventBus.emit('sigint:log', { cat:'OSINT', msg:'OSINT ENGINE READY — PRIMARY: ANUAPI / FALLBACK: CF WORKERS' });
    },
    query: _query,
  };
})();
