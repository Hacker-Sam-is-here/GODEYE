// ============================================================
//  GODEYE — CORS Proxy Utilities
// ============================================================

const CORS = {
  PROXIES: [
    { url: 'https://api.allorigins.win/get?url=', encode: true, unwrap: true },
    { url: 'https://api.codetabs.com/v1/proxy/?quest=', encode: true },
    { url: 'https://corsproxy.io/?', encode: true }
  ],

  async smartFetch(url, opts = {}) {
    const fetchWithTimeout = async (targetUrl, targetOpts = {}) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(targetUrl, { ...targetOpts, signal: controller.signal });
        clearTimeout(id);
        return res;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    try {
      const res = await fetchWithTimeout(url, opts);
      if (res.ok) return res;
    } catch (e) { /* Direct failed or timed out */ }

    for (const proxy of this.PROXIES) {
      try {
        const proxiedUrl = proxy.encode ? proxy.url + encodeURIComponent(url) : proxy.url + url;
        const res = await fetchWithTimeout(proxiedUrl, opts);
        if (res.ok) {
          if (proxy.unwrap) {
            const data = await res.json();
            return new Response(data.contents, { status: 200, statusText: 'OK' });
          }
          return res;
        }
      } catch (e) { continue; }
    }
    throw new Error(`All proxies and direct fetch failed for: ${url}`);
  },

  async fetchJSON(url, opts = {}) {
    const res = await this.smartFetch(url, opts);
    return res.json();
  },

  async fetchRSS(url, opts = {}) {
    const res = await this.smartFetch(url, opts);
    const text = await res.text();
    return this.parseRSS(text);
  },

  async direct(url, opts = {}) {
    const res = await fetch(url, opts);
    return res.json();
  },

  parseRSS(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = [];

    // RSS 2.0
    doc.querySelectorAll('item').forEach(el => {
      items.push({
        title: el.querySelector('title')?.textContent?.trim() || '',
        link: el.querySelector('link')?.textContent?.trim() ||
          el.querySelector('link')?.getAttribute('href') || '#',
        pubDate: el.querySelector('pubDate')?.textContent?.trim() ||
          el.querySelector('updated')?.textContent?.trim() || '',
        source: el.querySelector('source')?.textContent?.trim() ||
          doc.querySelector('channel > title')?.textContent?.trim() || 'RSS',
        desc: el.querySelector('description')?.textContent?.trim() ||
          el.querySelector('summary')?.textContent?.trim() || '',
      });
    });

    // Atom fallback
    if (items.length === 0) {
      doc.querySelectorAll('entry').forEach(el => {
        items.push({
          title: el.querySelector('title')?.textContent?.trim() || '',
          link: el.querySelector('link')?.getAttribute('href') || '#',
          pubDate: el.querySelector('updated')?.textContent?.trim() || '',
          source: doc.querySelector('feed > title')?.textContent?.trim() || 'Feed',
          desc: el.querySelector('summary, content')?.textContent?.trim() || '',
        });
      });
    }

    return items;
  },

  // Direct fetch (for APIs that support CORS natively)
  async direct(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // Direct fetch returning text
  async directText(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
};
