// Vercel serverless function — fetches a URL server-side to bypass CORS
// Handles Douyin short links, share pages, and general URLs
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var url = (req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Missing ?url=' });
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;

  try {
    var result = await fetchAndExtract(url);
    if (result.text && result.text.length >= 50) {
      return res.status(200).json({ text: result.text.slice(0, 5000), source: result.finalUrl || url });
    }
    return res.status(422).json({ error: 'Not enough content extracted' });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Fetch failed' });
  }
}

async function fetchAndExtract(url) {
  var ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

  // First request: follow redirects (important for v.douyin.com short links)
  var resp = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(10000)
  });

  var finalUrl = resp.url;
  var html = await resp.text();

  // === Douyin-specific: try to extract JSON data from script tags ===
  // Douyin video pages embed data in window.__INITIAL_STATE__ or similar
  var douyinData = extractDouyinScriptData(html);
  if (douyinData) return { text: douyinData, finalUrl: finalUrl };

  // === General HTML extraction ===
  var text = extractFromHtml(html);
  if (text.length >= 50) return { text: text, finalUrl: finalUrl };

  // === If content too short, try the share page for Douyin ===
  var videoId = extractDouyinVideoId(finalUrl);
  if (videoId) {
    var shareUrl = 'https://www.iesdouyin.com/share/video/' + videoId + '/';
    try {
      var shareResp = await fetch(shareUrl, {
        headers: { 'User-Agent': ua, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(8000)
      });
      var shareHtml = await shareResp.text();
      var shareData = extractDouyinScriptData(shareHtml);
      if (shareData) return { text: shareData, finalUrl: shareUrl };
      var shareText = extractFromHtml(shareHtml);
      if (shareText.length >= 50) return { text: shareText, finalUrl: shareUrl };
    } catch (e) { /* continue */ }
  }

  return { text: text, finalUrl: finalUrl };
}

function extractDouyinVideoId(url) {
  // www.douyin.com/video/123456789
  var m = url.match(/\/video\/(\d+)/);
  if (m) return m[1];
  // iesdouyin.com/share/video/123456789
  m = url.match(/\/share\/video\/(\d+)/);
  if (m) return m[1];
  // douyin.com/user/...?modal_id=123456789
  m = url.match(/modal_id=(\d+)/);
  if (m) return m[1];
  return null;
}

function extractDouyinScriptData(html) {
  // Try RENDER_DATA (newer Douyin pages)
  var m = html.match(/<script[^>]*id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) {
    try {
      var decoded = decodeURIComponent(m[1]);
      var json = JSON.parse(decoded);
      return extractDouyinVideoInfo(json);
    } catch (e) { /* not valid JSON */ }
  }

  // Try __INITIAL_STATE__ or __NUXT__
  var patterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
    /window\.__NUXT__\s*=\s*({[\s\S]*?});/,
    /"aweme"\s*:\s*\{[^}]*"desc"\s*:\s*"([^"]*)"/,
  ];

  for (var i = 0; i < patterns.length; i++) {
    m = html.match(patterns[i]);
    if (m) {
      if (m[1] && m[1].startsWith('{')) {
        try {
          var data = JSON.parse(m[1]);
          var info = extractDouyinVideoInfo(data);
          if (info) return info;
        } catch (e) {}
      }
      if (typeof m[1] === 'string' && m[1].length > 10) return '视频描述：' + m[1];
    }
  }

  // Try any JSON-LD or Schema.org VideoObject
  m = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) {
    try {
      var ld = JSON.parse(m[1]);
      var parts = [];
      if (ld.name) parts.push('标题：' + ld.name);
      if (ld.description) parts.push('描述：' + ld.description);
      if (parts.length) return parts.join('\n\n');
    } catch (e) {}
  }

  return null;
}

function extractDouyinVideoInfo(json) {
  // Walk through common Douyin data structures
  var parts = [];
  var aweme = findInObject(json, 'aweme') || findInObject(json, 'aweme_detail');
  if (!aweme) {
    // Try other paths
    var appData = json['app'] || json['page'] || json;
    aweme = findInArray(appData, 'aweme');
  }

  if (aweme) {
    if (aweme.desc) parts.push('文案：' + aweme.desc);
    if (aweme.create_time) {
      var d = new Date(aweme.create_time * 1000);
      parts.push('发布时间：' + d.toLocaleDateString('zh-CN'));
    }
    if (aweme.statistics) {
      var s = aweme.statistics;
      var stats = [];
      if (s.digg_count) stats.push('点赞' + formatNum(s.digg_count));
      if (s.comment_count) stats.push('评论' + formatNum(s.comment_count));
      if (s.share_count) stats.push('分享' + formatNum(s.share_count));
      if (s.play_count) stats.push('播放' + formatNum(s.play_count));
      if (stats.length) parts.push('数据：' + stats.join(' / '));
    }
    if (aweme.author) {
      parts.push('作者：' + (aweme.author.nickname || '未知'));
    }
    if (aweme.music) {
      parts.push('音乐：' + (aweme.music.title || aweme.music.author || ''));
    }
    if (aweme.video && aweme.video.duration) {
      parts.push('视频时长：' + Math.round(aweme.video.duration / 1000) + '秒');
    }
  }

  // Also try to find any "desc" field at any level
  if (parts.length === 0 && json.desc) {
    parts.push('文案：' + json.desc);
  }

  return parts.length ? parts.join('\n') : null;
}

function findInObject(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[key]) return obj[key];
  for (var k in obj) {
    if (typeof obj[k] === 'object' && obj[k]) {
      var found = findInObject(obj[k], key);
      if (found) return found;
    }
  }
  return null;
}

function findInArray(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  for (var k in obj) {
    if (Array.isArray(obj[k])) {
      for (var i = 0; i < obj[k].length; i++) {
        var found = findInObject(obj[k][i], key);
        if (found) return found;
      }
    }
  }
  return null;
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  return String(n);
}

function extractFromHtml(html) {
  var title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  var ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i);
  var desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
  if (!desc) desc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);

  var bodyText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x2F;/g, '/').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  var parts = [];
  if (ogTitle && ogTitle[1]) parts.push('标题：' + ogTitle[1].trim());
  else if (title && title[1]) parts.push('标题：' + title[1].trim());
  if (desc && desc[1]) parts.push('描述：' + desc[1].trim());
  if (bodyText) parts.push('正文：\n' + bodyText);

  return parts.join('\n\n');
}
