// Test the v4 regex on live Canada page
const http = require('http');
const HEADERS = {'User-Agent':'Mozilla/5.0','Accept-Language':'en-US,en;q=0.5'};
function get(url) {
  return new Promise(resolve => {
    http.get(url,{headers:HEADERS,timeout:12000},res=>{
      let d='';res.setEncoding('utf8');
      res.on('data',c=>d+=c);
      res.on('end',()=>resolve(d));
      res.on('error',()=>resolve(''));
    }).on('error',()=>resolve(''));
  });
}
(async()=>{
  const html = await get('http://insecam.org/en/bycountry/CA/?page=1');
  console.log('HTML length:', html.length);

  // v4 regex — handles multiline img tags
  const imgRe = /id="image(\d+)"[^>]*src="(http[^"]+)"/g;
  let m, results=[];
  while((m=imgRe.exec(html))!==null) results.push({id:m[1],s:m[2]});
  console.log('Single-line match results:', results.length);
  results.forEach(r=>console.log(' ', r.id, r.s.substring(0,60)));

  // Try with dotall / multiline for the img tag
  const re2 = /id="image(\d+)"[\s\S]*?src="(http[^"]+)"/g;
  let r2=[];
  while((m=re2.exec(html))!==null) r2.push({id:m[1],s:m[2]});
  console.log('\nMultiline match results:', r2.length);
  r2.forEach(r=>console.log(' ', r.id, r.s.substring(0,60)));

  // Parse coords test
  const detail = await get('http://insecam.org/en/view/887982/');
  const cells = detail.split('camera-details__cell">');
  console.log('\nCell count in detail page:', cells.length);
  for(let i=0;i<cells.length-1;i++){
    if(cells[i].includes('Latitude:')){
      console.log('Lat cell value:', JSON.stringify(cells[i+1].split('<')[0].trim()));
    }
    if(cells[i].includes('Longitude:')){
      console.log('Lng cell value:', JSON.stringify(cells[i+1].split('<')[0].trim()));
    }
  }
})();
