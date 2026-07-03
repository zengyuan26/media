// dev-server.js — Local dev server: static files + /api/analyze
// Usage: node dev-server.js  →  http://localhost:3456
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 80;
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// --- Video link analyzer ---
function getYouTubeId(u) { var m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }
function getBilibiliId(u) { var m = u.match(/BV[a-zA-Z0-9]{10}/); if (m) return m[0]; m = u.match(/av(\d+)/i); return m ? parseInt(m[1]) : null; }
function detectPlatform(u) { if (/douyin\.com|iesdouyin\.com/.test(u)) return '抖音'; if (/tiktok\.com/.test(u)) return 'TikTok'; if (/bilibili\.com|b23\.tv/.test(u)) return 'B站'; if (/xiaohongshu\.com|xhslink\.com/.test(u)) return '小红书'; if (/youtube\.com|youtu\.be/.test(u)) return 'YouTube'; if (/kuaishou\.com/.test(u)) return '快手'; return '未知平台'; }
function formatDuration(s) { if (!s) return ''; var m = Math.floor(s/60), sec = s%60; return m>0 ? m+'分'+sec+'秒' : sec+'秒'; }

function fetchUrl(u, opts) {
  return new Promise(function(resolve) {
    var get = u.startsWith('https') ? https.get : http.get;
    var o = Object.assign({ headers: {}, timeout: 6000 }, opts || {});
    o.headers = Object.assign({ 'User-Agent': 'Mozilla/5.0' }, o.headers);
    var req = get(u, o, function(res) {
      if (res.statusCode >= 400) { req.destroy(); resolve(null); return; }
      var body = '';
      res.on('data', function(d) { body += d; });
      res.on('end', function() { resolve(body); });
    });
    req.on('error', function() { resolve(null); });
    req.on('timeout', function() { req.destroy(); resolve(null); });
  });
}

async function extractBilibili(u) {
  var id = getBilibiliId(u); if (!id) return null;
  var apiUrl = (typeof id === 'string') ? 'https://api.bilibili.com/x/web-interface/view?bvid='+id : 'https://api.bilibili.com/x/web-interface/view?aid='+id;
  var body = await fetchUrl(apiUrl, { headers: { 'Referer': 'https://www.bilibili.com', 'Origin': 'https://www.bilibili.com' } });
  if (!body) return null;
  try { var j = JSON.parse(body); if (j.code===0 && j.data) { var d=j.data; return { title:(d.title||'').trim(), description:(d.desc||'').trim(), duration:formatDuration(d.duration||0), uploader:(d.owner&&d.owner.name||'').trim(), url:u, platform:'B站' }; } } catch(e){}
  return null;
}

async function extractFromPage(u) {
  var body = await fetchUrl(u, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' } });
  if (!body) return null;
  var ogT = body.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  var ogD = body.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) || body.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
  var tt = body.match(/<title>([^<]+)<\/title>/i);
  var title = (ogT&&ogT[1]||tt&&tt[1]||'').trim();
  var desc = (ogD&&ogD[1]||'').trim();
  if (!title && !desc) return null;
  return { title:title, description:desc, duration:'', uploader:'', url:u };
}

async function analyze(url) {
  var plat = detectPlatform(url), data = null;
  if (plat==='B站') data = await extractBilibili(url);
  if (!data) data = await extractFromPage(url);
  if (data) { data.platform=plat; data.duration=data.duration||''; data.uploader=data.uploader||''; data.description=data.description||''; }
  if (!data||(!data.title&&!data.description)) {
    return { title:'', description:'', duration:'', uploader:'', url:url, platform:plat, _fallback:true, _message:'无法提取视频详情。请手动填写。' };
  }
  return data;
}

// --- Server ---
var server = http.createServer(async function(req, res) {
  var u = require('url').parse(req.url);
  var pn = u.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(200); res.end(); return;
  }

  if (pn === '/api/analyze' && req.method === 'POST') {
    var body = '';
    req.on('data', function(d) { body += d; });
    req.on('end', async function() {
      var parsed = {}; try { parsed = JSON.parse(body); } catch(e){}
      var result = await analyze(parsed.url || '');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(result));
    });
    return;
  }

  // Static files
  var fp = path.join(__dirname, pn === '/' ? 'index.html' : pn);
  var ext = path.extname(fp);
  if (!ext) { fp = path.join(__dirname, 'index.html'); ext = '.html'; }
  fs.readFile(fp, function(err, data) {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.setHeader('Content-Type', MIME[ext] || 'text/plain');
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(PORT, function() { console.log('Server running on port ' + PORT); });
