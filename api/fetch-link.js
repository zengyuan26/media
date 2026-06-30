// Vercel serverless function — fetches a URL server-side to bypass CORS
export default async function handler(req, res) {
  // CORS headers so browser can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing ?url=' });

  try {
    // Add protocol if missing
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;

    var response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return res.status(502).json({ error: 'Page returned ' + response.status });

    var html = await response.text();
    var text = extractText(html);

    if (text.length < 80) return res.status(422).json({ error: 'Could not extract enough content' });

    return res.status(200).json({ text: text.slice(0, 5000), source: url });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Fetch failed' });
  }
}

function extractText(html) {
  // Try Douyin/ByteDance meta first
  var desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
  if (!desc) desc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);
  if (!desc) desc = html.match(/<meta[^>]*name="twitter:description"[^>]*content="([^"]*)"/i);

  var title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  var ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i);

  // Try to find video description in common JSON-LD or script patterns
  var bodyText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Assemble result: title + description + body
  var parts = [];
  if (ogTitle && ogTitle[1]) parts.push('标题：' + ogTitle[1]);
  else if (title && title[1]) parts.push('标题：' + title[1]);
  if (desc && desc[1]) parts.push('描述：' + desc[1]);
  if (bodyText) parts.push('正文：\n' + bodyText);

  return parts.join('\n\n');
}
