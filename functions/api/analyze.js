// ============================================================
// functions/api/analyze.js — Cloudflare Pages Function
// Extract short-video metadata via platform HTTP APIs
// ============================================================

async function extractYouTube(url) {
  const videoId = getYouTubeId(url);
  if (!videoId) return null;
  const oembedUrl = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json';
  const resp = await fetch(oembedUrl);
  if (!resp.ok) return null;
  const data = await resp.json();
  return {
    title: (data.title || '').trim(), description: '', duration: '',
    uploader: (data.author_name || '').trim(),
    url: 'https://www.youtube.com/watch?v=' + videoId, platform: 'YouTube',
  };
}

function getYouTubeId(url) {
  var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function extractBilibili(url) {
  const id = getBilibiliId(url);
  if (!id) return null;
  try {
    var apiUrl = (typeof id === 'string' && id.toUpperCase().startsWith('BV'))
      ? 'https://api.bilibili.com/x/web-interface/view?bvid=' + id
      : 'https://api.bilibili.com/x/web-interface/view?aid=' + id;
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com', 'Origin': 'https://www.bilibili.com',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.code !== 0 || !json.data) return null;
    const d = json.data;
    return {
      title: (d.title || '').trim(), description: (d.desc || '').trim(),
      duration: formatDuration(d.duration || 0),
      uploader: (d.owner && d.owner.name || '').trim(), url: url, platform: 'B站',
    };
  } catch (e) { return null; }
}

function getBilibiliId(url) {
  var m = url.match(/BV[a-zA-Z0-9]{10}/);
  if (m) return m[0];
  m = url.match(/av(\d+)/i);
  if (m) return parseInt(m[1]);
  return null;
}

async function extractFromPage(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
      redirect: 'follow', signal: AbortSignal.timeout(6000),
    });
    const html = await resp.text();
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
    const ogDesc2 = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
    const titleTag = html.match(/<title>([^<]+)<\/title>/i);
    const title = (ogTitle && ogTitle[1] || titleTag && titleTag[1] || '').trim();
    const desc = (ogDesc && ogDesc[1] || ogDesc2 && ogDesc2[1] || '').trim();
    if (!title && !desc) return null;
    return { title: title, description: desc, duration: '', uploader: '', url: url };
  } catch (e) { return null; }
}

async function extractDouyin(url) {
  try {
    const resp = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
      signal: AbortSignal.timeout(5000),
    });
    const location = resp.headers.get('location');
    if (location) { const d = await extractFromPage(location); if (d) return d; }
  } catch (e) {}
  return await extractFromPage(url);
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? m + '分' + s + '秒' : s + '秒';
}

const PLATFORMS = [
  { pattern: /douyin\.com|iesdouyin\.com/, name: '抖音', fn: extractDouyin },
  { pattern: /tiktok\.com/, name: 'TikTok', fn: extractFromPage },
  { pattern: /bilibili\.com|b23\.tv/, name: 'B站', fn: extractBilibili },
  { pattern: /xiaohongshu\.com|xhslink\.com/, name: '小红书', fn: extractFromPage },
  { pattern: /youtube\.com|youtu\.be/, name: 'YouTube', fn: extractYouTube },
  { pattern: /kuaishou\.com/, name: '快手', fn: extractFromPage },
];

function detectPlatform(url) {
  const m = PLATFORMS.find(function(p) { return p.pattern.test(url); });
  return m || null;
}

function fallbackResult(url) {
  const plat = detectPlatform(url);
  return {
    title: '', description: '', duration: '', uploader: '', url: url,
    platform: plat ? plat.name : '未知平台', _fallback: true,
    _message: '无法提取视频详情。请手动填写问答。',
  };
}

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const body = await context.request.json().catch(function() { return {}; });
  const url = body.url;
  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: corsHeaders });
  }

  try {
    const plat = detectPlatform(url);

    if (plat && plat.fn) {
      try {
        const data = await plat.fn(url);
        if (data) {
          data.platform = plat.name;
          if (!data.duration) data.duration = '';
          if (!data.uploader) data.uploader = '';
          if (!data.description) data.description = '';
          if (data.title || data.description) {
            return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });
          }
        }
      } catch (e) { console.error('[analyze] Platform error:', e.message); }
    }

    const pageData = await extractFromPage(url);
    if (pageData && (pageData.title || pageData.description)) {
      pageData.platform = plat ? plat.name : '未知平台';
      pageData.duration = pageData.duration || '';
      pageData.uploader = pageData.uploader || '';
      return new Response(JSON.stringify(pageData), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify(fallbackResult(url)), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('[analyze] Error:', e.message);
    return new Response(JSON.stringify(fallbackResult(url)), { status: 200, headers: corsHeaders });
  }
}
