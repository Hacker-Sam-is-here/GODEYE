// Discover all listing endpoints on Insecam
const http = require('http');
const HEADERS = {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept-Language':'en-US,en;q=0.5'};
function get(url) {
  return new Promise(resolve => {
    http.get(url,{headers:HEADERS,timeout:15000},res=>{
      let d='';res.setEncoding('utf8');
      res.on('data',c=>d+=c);res.on('end',()=>resolve(d));res.on('error',()=>resolve(''));
    }).on('error',()=>resolve(''));
  });
}
(async()=>{
  // Check available navigation links on homepage
  const home = await get('http://insecam.org/en/');
  const links = [...home.matchAll(/href="\/en\/([^"]+)"/g)].map(m=>m[1]);
  const unique = [...new Set(links)].filter(l=>!l.includes('view') && !l.includes('bycountry'));
  console.log('Navigation links:', unique.slice(0,30));

  // Try bytype
  const bytype = await get('http://insecam.org/en/bytype/');
  console.log('\n/bytype/ length:', bytype.length);
  const types = [...bytype.matchAll(/href="\/en\/bytype\/([^"\/]+)\/"/g)].map(m=>m[1]);
  console.log('Types found:', [...new Set(types)].slice(0,20));

  // Try new
  const newpage = await get('http://insecam.org/en/new/');
  console.log('\n/new/ length:', newpage.length);
  const newCams = [...newpage.matchAll(/id="image(\d+)"/g)].map(m=>m[1]);
  console.log('New cameras on page 1:', newCams.length, newCams.slice(0,5));

  // Check total camera count from countries
  const countries = JSON.parse(await get('http://insecam.org/en/jsoncountries/'));
  const total = Object.values(countries.countries).reduce((s,c)=>s+(c.count||0),0);
  console.log('\nTotal cameras listed across all countries:', total);
})();
