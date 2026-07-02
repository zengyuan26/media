// ============================================================
// Electron main process — 自媒体创作助手
// ============================================================
const { app, BrowserWindow, ipcMain } = require('electron');
const https = require('https');
const http = require('http');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================================
// IPC: Local link extraction (for Chinese platforms blocked by Vercel geo)
// ============================================================

function localFetch(url, opts) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: opts.method || 'GET', headers: opts.headers || {}, timeout: 8000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return localFetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        text: () => Promise.resolve(Buffer.concat(chunks).toString('utf-8')),
        json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))),
        headers: res.headers,
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function getYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getBilibiliId(url) {
  const m = url.match(/BV[a-zA-Z0-9]{10}/);
  if (m) return { type: 'bvid', id: m[0] };
  const m2 = url.match(/av(\d+)/i);
  if (m2) return { type: 'aid', id: parseInt(m2[1]) };
  return null;
}

async function extractYouTube(url) {
  const videoId = getYouTubeId(url);
  if (!videoId) return null;
  const resp = await localFetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json', {});
  if (!resp.ok) return null;
  const data = await resp.json();
  return {
    title: (data.title || '').trim(),
    description: '',
    duration: '',
    uploader: (data.author_name || '').trim(),
    url: 'https://www.youtube.com/watch?v=' + videoId,
    platform: 'YouTube',
  };
}

async function extractBilibili(url) {
  const id = getBilibiliId(url);
  if (!id) return null;
  try {
    const apiUrl = id.type === 'bvid'
      ? 'https://api.bilibili.com/x/web-interface/view?bvid=' + id.id
      : 'https://api.bilibili.com/x/web-interface/view?aid=' + id.id;
    const resp = await localFetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com' },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.code !== 0 || !json.data) return null;
    const d = json.data;
    const durSec = d.duration || 0;
    const durMin = Math.floor(durSec / 60);
    return {
      title: (d.title || '').trim(),
      description: (d.desc || '').trim(),
      duration: durMin > 0 ? durMin + '分' + (durSec % 60) + '秒' : (durSec + '秒'),
      uploader: (d.owner && d.owner.name || '').trim(),
      url: url,
      platform: 'B站',
    };
  } catch (_) { return null; }
}

async function extractFromPage(url) {
  try {
    const resp = await localFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
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
  } catch (_) { return null; }
}

async function extractDouyin(url) {
  const resp = await localFetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
  });
  const location = resp.headers && resp.headers.location;
  if (location) {
    const data = await extractFromPage(location);
    if (data) return data;
  }
  return await extractFromPage(url);
}

const PLATFORM_EXTRACTORS = {
  douyin: extractDouyin,
  tiktok: extractFromPage,
  bilibili: extractBilibili,
  xiaohongshu: extractFromPage,
  youtube: extractYouTube,
  kuaishou: extractFromPage,
};

async function parseLinkLocal(url) {
  const patterns = [
    { name: 'douyin', re: /douyin\.com|iesdouyin\.com/ },
    { name: 'tiktok', re: /tiktok\.com/ },
    { name: 'bilibili', re: /bilibili\.com|b23\.tv/ },
    { name: 'xiaohongshu', re: /xiaohongshu\.com|xhslink\.com/ },
    { name: 'youtube', re: /youtube\.com|youtu\.be/ },
    { name: 'kuaishou', re: /kuaishou\.com/ },
  ];

  const matched = patterns.find((p) => p.re.test(url));
  const platform = matched ? matched.name : null;
  const extractor = platform ? PLATFORM_EXTRACTORS[platform] : null;

  if (extractor) {
    const data = await extractor(url);
    if (data) {
      data.platform = platform === 'douyin' ? '抖音' : platform === 'bilibili' ? 'B站' : platform === 'xiaohongshu' ? '小红书' : platform === 'kuaishou' ? '快手' : platform;
      return data;
    }
  }

  // Fallback: generic page extraction
  const pageData = await extractFromPage(url);
  if (pageData) return pageData;

  return null;
}

ipcMain.handle('parse-link', async (_event, url) => {
  try {
    const data = await parseLinkLocal(url);
    return data || { _fallback: true, _message: '无法提取视频详情' };
  } catch (e) {
    return { _fallback: true, _message: e.message };
  }
});
