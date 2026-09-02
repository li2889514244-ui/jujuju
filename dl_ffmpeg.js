const fs = require('fs');
const https = require('https');
const http = require('http');

const out = 'C:\\Users\\EDY\\jujuju\\ffmpeg-essentials.zip';

function get(url, headers, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      const code = res.statusCode;
      if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
        const loc = res.headers.location;
        if (!loc) return reject(new Error('redirect without location'));
        const next = new URL(loc, url).toString();
        return resolve(get(next, headers, redirectsLeft - 1));
      }
      resolve({ code, res });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('connect timeout')); });
  });
}

(async () => {
  let url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
  for (let attempt = 1; attempt <= 8; attempt++) {
    const existing = fs.existsSync(out) ? fs.statSync(out).size : 0;
    console.log('attempt ' + attempt + ', resume from ' + existing);
    try {
      const { code, res } = await get(url, existing > 0 ? { Range: 'bytes=' + existing + '-' } : {}, 5);
      if (code !== 200 && code !== 206) { res.resume(); throw new Error('HTTP ' + code); }
      console.log('status ' + code + ', content-length ' + res.headers['content-length']);
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(out, existing > 0 && code === 206 ? { flags: 'a' } : {});
        let got = existing;
        res.on('data', (chunk) => { got += chunk.length; if (got % (8 * 1024 * 1024) < 65536) console.log('downloaded ' + got); });
        res.pipe(ws);
        res.on('end', () => { ws.end(() => { console.log('finished, size ' + got); resolve(); }); });
        res.on('error', reject);
        ws.on('error', reject);
      });
      const size = fs.statSync(out).size;
      if (size > 40 * 1024 * 1024) { console.log('download complete, size ' + size); return; }
      console.log('looks incomplete, retrying');
    } catch (e) {
      console.log('error: ' + e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.log('give up');
})();
