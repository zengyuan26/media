// CloudBase HTTP Cloud Function: api/analyze
// Extract short-video metadata via platform HTTP APIs

async function extractYouTube(url) {
  var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (!m) return null;
  var id = m[1];
  var resp = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + id + '&format=json');
  if (!resp.ok) return null;
  var data = await resp.json();
  return { title: (data.title || '').trim(), description: '', duration: '', uploader: (data.author_name || '').trim(), url: 'https://www.youtube.com/watch?v=' + id, platform: 'YouTube' };
}

async function extractBilibili(url) {
  var m = url.match(/BV[a-zA-Z0-9]{10}/);
  var id = m ? m[0] : null;
  if (!id) { m = url.match(/av(\d+)/i); id = m ? parseInt(m[1]) : null; }
  if (!id) return null;
  var apiUrl = typeof id === 'string' ? 'https://api.bilibili.com/x/web-interface/view?bvid=' + id : 'https://api.bilibili.com/x/web-interface/view?aid=' + id;
  try {
    var resp = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bilibili.com', 'Origin': 'https://www.bilibili.com' },
    });
    if (!resp.ok) return null;
    var json = await resp.json();
    if (json.code !== 0 || !json.data) return null;
    var d = json.data;
    return { title: (d.title || '').trim(), description: (d.desc || '').trim(), duration: formatDur(d.duration || 0), uploader: (d.owner && d.owner.name || '').trim(), url: url, platform: 'B站' };
  } catch (e) { return null; }
}

async function extractFromPage(url) {
  try {
    var resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
      redirect: 'follow',
    });
    var html = await resp.text();
    var ogT = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    var ogD = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) || html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
    var tt = html.match(/<title>([^<]+)<\/title>/i);
    var title = (ogT && ogT[1] || tt && tt[1] || '').trim();
    var desc = (ogD && ogD[1] || '').trim();
    if (!title && !desc) return null;
    return { title: title, description: desc, duration: '', uploader: '', url: url };
  } catch (e) { return null; }
}

function formatDur(s) { if (!s) return ''; var m = Math.floor(s/60), sec = s%60; return m>0 ? m+'分'+sec+'秒' : sec+'秒'; }

function detectPlatform(u) {
  if (/douyin\.com|iesdouyin\.com/.test(u)) return '抖音';
  if (/tiktok\.com/.test(u)) return 'TikTok';
  if (/bilibili\.com|b23\.tv/.test(u)) return 'B站';
  if (/xiaohongshu\.com|xhslink\.com/.test(u)) return '小红书';
  if (/youtube\.com|youtu\.be/.test(u)) return 'YouTube';
  if (/kuaishou\.com/.test(u)) return '快手';
  return '未知平台';
}

exports.main = async function(event, context) {
  var httpContext = context.httpContext || {};
  var httpMethod = httpContext.httpMethod || 'GET';
  var url = httpContext.url || '';

  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: ''
    };
  }
  if (httpMethod !== 'POST') {
    return { statusCode: 405, headers: {}, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  var videoUrl = body.url;
  if (!videoUrl) {
    return { statusCode: 400, headers: {}, body: JSON.stringify({ error: 'Missing url' }) };
  }

  var plat = detectPlatform(videoUrl);
  var data = null;

  try {
    if (plat === 'YouTube') data = await extractYouTube(videoUrl);
    else if (plat === 'B站') data = await extractBilibili(videoUrl);
    else data = await extractFromPage(videoUrl);

    if (data) { data.platform = plat; data.duration = data.duration || ''; data.uploader = data.uploader || ''; data.description = data.description || ''; }
    if (!data || (!data.title && !data.description)) {
      var pg = await extractFromPage(videoUrl);
      if (pg && (pg.title || pg.description)) { pg.platform = plat; pg.duration = ''; pg.uploader = ''; data = pg; }
    }
  } catch (e) {}

  var result;
  if (data && (data.title || data.description)) {
    result = data;
  } else {
    result = { title: '', description: '', duration: '', uploader: '', url: videoUrl, platform: plat, _fallback: true, _message: '无法提取视频详情' };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(result)
  };
};
