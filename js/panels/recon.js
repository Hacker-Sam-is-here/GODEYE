// ============================================================
//  GODEYE — Panel: RECON Toolkit (OSINT Tools)
// ============================================================
const ReconPanel = (() => {

  async function _dns(target) {
    const el = document.getElementById('recon-output');
    el.textContent = '> QUERYING DNS…';
    try {
      const types = ['A','AAAA','MX','NS','TXT','CNAME'];
      const results = await Promise.all(types.map(async t => {
        const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(target)}&type=${t}`);
        const d = await r.json();
        return { type: t, answers: d.Answer || [] };
      }));
      let out = `> DNS LOOKUP: ${target}\n${'─'.repeat(40)}\n`;
      results.forEach(r => {
        if (!r.answers.length) return;
        out += `\n[${r.type}]\n`;
        r.answers.forEach(a => { out += `  ${a.data}\n`; });
      });
      el.textContent = out || '> NO RECORDS FOUND';
      EventBus.emit('sigint:log', { cat: 'RECON', msg: `DNS QUERY: ${target}` });
    } catch(e) { el.textContent = `> ERROR: ${e.message}`; }
  }

  async function _ipIntel(target) {
    const el = document.getElementById('recon-output');
    el.textContent = '> QUERYING IP INTEL…';
    try {
      const r = await fetch(`https://ipapi.co/${target}/json/`);
      const d = await r.json();
      if (d.error) throw new Error(d.reason || 'Failed');
      const out = `> IP INTELLIGENCE: ${target}
${'─'.repeat(40)}
IP        : ${d.ip}
CITY      : ${d.city || 'N/A'}
REGION    : ${d.region || 'N/A'}
COUNTRY   : ${d.country_name || 'N/A'} (${d.country || ''})
POSTAL    : ${d.postal || 'N/A'}
COORDS    : ${d.latitude}, ${d.longitude}
TIMEZONE  : ${d.timezone || 'N/A'}
ORG / ASN : ${d.org || 'N/A'}
ASN       : ${d.asn || 'N/A'}
CURRENCY  : ${d.currency || 'N/A'}
CALLING   : +${d.country_calling_code || 'N/A'}
LANGUAGES : ${d.languages || 'N/A'}`;
      el.textContent = out;
      if (d.latitude && d.longitude) {
        MAP2D.flyTo(d.latitude, d.longitude, 8);
        EventBus.emit('sigint:log', { cat: 'RECON', msg: `IP GEOLOCATED: ${target} → ${d.city}, ${d.country_name}` });
      }
    } catch(e) { el.textContent = `> ERROR: ${e.message}`; }
  }

  async function _whois(target) {
    const el = document.getElementById('recon-output');
    el.textContent = '> QUERYING WHOIS…';
    try {
      const r = await fetch(`https://api.domainsdb.info/v1/domains/search?domain=${encodeURIComponent(target)}&zone=com`);
      const d = await r.json();
      const dom = d.domains?.[0];
      if (dom) {
        el.textContent = `> WHOIS: ${target}\n${'─'.repeat(40)}\nDOMAIN  : ${dom.domain}\nCREATED : ${dom.create_date || 'N/A'}\nUPDATED : ${dom.update_date || 'N/A'}\nALEXA   : ${dom.alexa || 'N/A'}\nCOUNTRY : ${dom.country || 'N/A'}`;
      } else {
        // Fallback to rdap
        const r2 = await fetch(`https://rdap.org/domain/${target}`);
        const d2 = await r2.json();
        let out = `> WHOIS/RDAP: ${target}\n${'─'.repeat(40)}\n`;
        (d2.events || []).forEach(ev => { out += `${ev.eventAction?.toUpperCase()}: ${ev.eventDate?.slice(0,10)}\n`; });
        (d2.nameservers || []).forEach(ns => { out += `NS: ${ns.ldhName}\n`; });
        el.textContent = out;
      }
      EventBus.emit('sigint:log', { cat: 'RECON', msg: `WHOIS QUERY: ${target}` });
    } catch(e) { el.textContent = `> ERROR: ${e.message}`; }
  }

  async function _ssl(target) {
    const el = document.getElementById('recon-output');
    el.textContent = '> QUERYING CERTIFICATE TRANSPARENCY…';
    try {
      const domain = target.replace(/^https?:\/\//, '').split('/')[0];
      const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
      const d = await r.json();
      const certs = d.slice(0, 10);
      let out = `> SSL/TLS CERTS: ${domain}\n${'─'.repeat(40)}\nFOUND ${d.length} certificate(s) — showing 10\n\n`;
      certs.forEach((c, i) => {
        out += `[${i+1}] CN: ${c.common_name}\n    ISSUER : ${c.issuer_name?.slice(0,60)}\n    VALID  : ${c.not_before?.slice(0,10)} → ${c.not_after?.slice(0,10)}\n\n`;
      });
      el.textContent = out;
      EventBus.emit('sigint:log', { cat: 'RECON', msg: `SSL CERT QUERY: ${domain} (${d.length} certs)` });
    } catch(e) { el.textContent = `> ERROR: ${e.message}`; }
  }

  async function _cve(keyword) {
    const el = document.getElementById('recon-output');
    el.textContent = '> SEARCHING NVD CVE DATABASE…';
    try {
      const r = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=10`);
      const d = await r.json();
      const vulns = d.vulnerabilities || [];
      if (!vulns.length) { el.textContent = '> NO CVEs FOUND FOR: ' + keyword; return; }
      let out = `> CVE LOOKUP: "${keyword}"\n${'─'.repeat(40)}\nFOUND ${d.totalResults} result(s) — showing 10\n\n`;
      vulns.forEach(v => {
        const cve  = v.cve;
        const desc = cve.descriptions?.find(d => d.lang === 'en')?.value || 'N/A';
        const cvss = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore
                  || cve.metrics?.cvssMetricV2?.[0]?.cvssData?.baseScore || 'N/A';
        out += `[${cve.id}] CVSS: ${cvss}\n${desc.slice(0,120)}…\n\n`;
      });
      el.textContent = out;
      EventBus.emit('sigint:log', { cat: 'RECON', msg: `CVE SEARCH: ${keyword} (${d.totalResults} hits)` });
    } catch(e) { el.textContent = `> ERROR: ${e.message}`; }
  }

  return {
    init() {
      const body = document.getElementById('tab-recon');
      if (!body) return;

      body.innerHTML = `
        <div class="feed-header" style="flex-shrink:0;">
          <span class="feed-title">🔍 RECON TOOLKIT</span>
        </div>
        <div style="padding:8px;flex-shrink:0;">
          <div style="display:flex;gap:4px;margin-bottom:6px;">
            <input id="recon-input" type="text" placeholder="IP, domain, CVE keyword…"
              style="flex:1;background:rgba(0,10,0,0.8);border:1px solid var(--border);color:var(--green);font-family:var(--font);font-size:0.75rem;padding:5px 8px;border-radius:3px;outline:none;">
            <select id="recon-mode" style="background:var(--panel-bg);border:1px solid var(--border);color:var(--green);font-family:var(--font);font-size:0.7rem;padding:4px;">
              <option value="dns">DNS</option>
              <option value="ip">IP INTEL</option>
              <option value="whois">WHOIS</option>
              <option value="ssl">SSL/TLS</option>
              <option value="cve">CVE SEARCH</option>
            </select>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
            <button class="recon-quick-btn action-btn" data-val="8.8.8.8"          data-mode="ip">8.8.8.8</button>
            <button class="recon-quick-btn action-btn" data-val="1.1.1.1"          data-mode="ip">1.1.1.1</button>
            <button class="recon-quick-btn action-btn" data-val="google.com"       data-mode="dns">google.com</button>
            <button class="recon-quick-btn action-btn" data-val="apache"           data-mode="cve">Apache CVEs</button>
          </div>
          <button id="recon-run-btn" class="action-btn" style="width:100%;font-size:0.75rem;padding:6px;">▶ RUN QUERY</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:0;font-family:var(--font);">
          <pre id="recon-output" style="margin:0;padding:10px;font-size:0.7rem;color:var(--green-dim);white-space:pre-wrap;word-break:break-all;line-height:1.6;min-height:200px;">
> RECON TOOLKIT READY
> SELECT A MODE AND ENTER A TARGET
> ─────────────────────────────
> DNS      — resolve all record types
> IP INTEL — geolocate & ASN lookup
> WHOIS    — domain registration data
> SSL/TLS  — certificate transparency
> CVE      — NVD vulnerability search
          </pre>
        </div>
        <div style="padding:6px 8px;border-top:1px solid var(--border);flex-shrink:0;">
          <div style="font-size:0.6rem;color:#005510;text-align:center;">
            APIs: dns.google · ipapi.co · crt.sh · NVD NIST · RDAP
          </div>
        </div>`;

      const input = body.querySelector('#recon-input');
      const mode  = body.querySelector('#recon-mode');
      const runBtn= body.querySelector('#recon-run-btn');

      const dispatch = () => {
        const t = input.value.trim();
        const m = mode.value;
        if (!t) return;
        const fn = { dns: _dns, ip: _ipIntel, whois: _whois, ssl: _ssl, cve: _cve }[m];
        fn?.(t);
      };

      runBtn.addEventListener('click', dispatch);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') dispatch(); });

      body.querySelectorAll('.recon-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          input.value  = btn.dataset.val;
          mode.value   = btn.dataset.mode;
          dispatch();
        });
      });

      EventBus.emit('sigint:log', { cat: 'RECON', msg: 'RECON TOOLKIT INITIALIZED' });
    }
  };
})();
