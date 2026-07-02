// ============================================================
// api/analyze.js — Vercel serverless function
// Extract short-video metadata from Douyin/TikTok/Bilibili/YouTube links
// Uses yt-dlp binary (no video download, metadata only, <5s)
// ============================================================
const { execSync } = require('child_process');
const { existsSync, writeFileSync, chmodSync } = require('fs');
const https = require('https');

const YT_DLP_PATH = '/tmp/yt-dlp_linux';
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

let ytDlpReady = false;

async function ensureYtDlp() {
  if (ytDlpReady && existsSync(YT_DLP_PATH)) return;
  if (existsSync(YT_DLP_PATH)) {
    chmodSync(YT_DLP_PATH, 0o755);
    ytDlpReady = true;
    return;
  }
  console.log('[analyze] Downloading yt-dlp binary...');
  const bin = await downloadFile(YT_DLP_URL);
  writeFileSync(YT_DLP_PATH, bin);
  chmodSync(YT_DLP_PATH, 0o755);
  console.log('[analyze] yt-dlp ready (' + bin.length + ' bytes)');
  ytDlpReady = true;
}

function extractWithYtDlp(url) {
  const args = [
    '--no-warnings',
    '--print', 'title',
    '--print', 'description',
    '--print', 'duration_string',
    '--print', 'uploader',
    '--print', 'webpage_url',
    '--socket-timeout', '10',
    '--retries', '1',
    '--no-playlist',
    url
  ];

  const stdout = execSync(YT_DLP_PATH + ' ' + args.join(' '), {
    timeout: 8000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const lines = stdout.trim().split('\n');
  return {
    title: (lines[0] || '').trim(),
    description: (lines[1] || '').trim(),
    duration: (lines[2] || '').trim(),
    uploader: (lines[3] || '').trim(),
    url: (lines[4] || '').trim(),
  };
}

const PLATFORMS = [
  { pattern: /douyin\.com|iesdouyin\.com/, name: '抖音' },
  { pattern: /tiktok\.com/, name: 'TikTok' },
  { pattern: /bilibili\.com|b23\.tv/, name: 'B站' },
  { pattern: /xiaohongshu\.com|xhslink\.com/, name: '小红书' },
  { pattern: /youtube\.com|youtu\.be/, name: 'YouTube' },
  { pattern: /kuaishou\.com/, name: '快手' },
];

function detectPlatform(url) {
  const m = PLATFORMS.find((p) => p.pattern.test(url));
  return m ? m.name : '未知平台';
}

function fallbackResult(url) {
  return {
    title: '',
    description: '',
    duration: '',
    uploader: '',
    url: url,
    platform: detectPlatform(url),
    _fallback: true,
    _message: '无法提取视频详情。请手动填写问答，或检查链接是否有效。抖音链接请使用「分享→复制链接」获取的完整链接。',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    await ensureYtDlp();
    const data = extractWithYtDlp(url);

    if (!data.title && !data.description) {
      return res.json(fallbackResult(url));
    }

    data.platform = detectPlatform(url);
    return res.json(data);
  } catch (e) {
    console.error('[analyze] Error:', e.message);
    return res.json(fallbackResult(req.body.url || url));
  }
};
