/**
 * ALLDOWN iOS Pro - Backend Server & Stream Proxy for iPhone (PWA + Apple Shortcuts)
 * Port: 3000 (Default)
 * Author: Nghia MMO
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { extractMedia } = require('./extractor');
const {
  generateAppleShortcutPlist,
  generateScriptableCode
} = require('./shortcut-generator');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.plist': 'application/x-plist',
  '.mobileconfig': 'application/x-apple-aspen-config',
  '.ipa': 'application/octet-stream'
};

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        if (raw.trim().startsWith('{')) {
          resolve(JSON.parse(raw));
        } else {
          const params = new URLSearchParams(raw);
          resolve(Object.fromEntries(params.entries()));
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    const hostHeader = req.headers.host || `localhost:${PORT}`;
    const parsedUrl = new URL(req.url, `http://${hostHeader}`);
    const pathname = parsedUrl.pathname;

    // 1. Health & Info API
    if (pathname === '/api/info') {
      const lanIp = getLocalLanIp();
      return sendJson(res, 200, {
        app: 'ALLDOWN iOS Pro (SnapVideo Rebuild)',
        version: '2.0.0',
        author: 'Nghia MMO',
        lanUrl: `http://${lanIp}:${PORT}`,
        shortcutEndpoint: `http://${lanIp}:${PORT}/api/direct-stream?url=`,
        extractEndpoint: `http://${lanIp}:${PORT}/api/extract`
      });
    }

    // 1b. Direct 1-Tap iCloud Shortcut Landing Page ("Nghĩa MMO Download" OpenGraph + Auto DeepLink)
    if (
      pathname === '/nghiammo' ||
      pathname === '/install-shortcut' ||
      pathname === '/snapvideo'
    ) {
      const landingPath = path.join(PUBLIC_DIR, 'nghia-mmo-download.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(landingPath).pipe(res);
      return;
    }
    if (pathname === '/install-tdownload') {
      res.writeHead(302, {
        Location: 'https://www.icloud.com/shortcuts/b44699c7197f40e582072a7c9dd52084'
      });
      return res.end();
    }
    if (pathname === '/install-dtiktok') {
      res.writeHead(302, {
        Location: 'https://www.icloud.com/shortcuts/f9d6e7635e344a9c9acde9780ba85ed8'
      });
      return res.end();
    }
    if (pathname === '/install-fb') {
      res.writeHead(302, {
        Location: 'https://www.icloud.com/shortcuts/60fd5ab5d341496c9e167207b3633d74'
      });
      return res.end();
    }

    // 2. Extract Media Metadata API (GET & POST) - Dùng cho cả Web App iOS & Apple Shortcuts
    if (pathname === '/api/extract') {
      let targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl && req.method === 'POST') {
        const body = await readJsonBody(req);
        targetUrl = body.url || body.text || body.input;
      }

      if (!targetUrl) {
        return sendJson(res, 400, {
          success: false,
          error: 'Thiếu tham số url (link TikTok hoặc Facebook)!'
        });
      }

      const result = await extractMedia(targetUrl);
      return sendJson(res, 200, result);
    }

    // 3. One-Step Direct Stream API dành riêng cho Phím tắt iPhone (Apple Shortcuts)
    // Chỉ cần gọi GET /api/direct-stream?url=<link_tiktok_or_fb> -> Trả thẳng về file MP4 Không Logo!
    if (pathname === '/api/direct-stream') {
      let targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl && req.method === 'POST') {
        const body = await readJsonBody(req);
        targetUrl = body.url || body.text;
      }

      if (!targetUrl) {
        return sendJson(res, 400, {
          success: false,
          error: 'Missing url parameter'
        });
      }

      const info = await extractMedia(targetUrl);
      if (!info.bestVideoUrl) {
        return sendJson(res, 404, {
          success: false,
          error: 'Không tìm thấy luồng MP4 hợp lệ'
        });
      }

      const upstream = await fetch(info.bestVideoUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          Referer:
            info.platform === 'tiktok'
              ? 'https://www.tikwm.com/'
              : 'https://www.facebook.com/'
        }
      });

      const fileName = `ALLDOWN_${info.platform}_${info.id || Date.now()}.mp4`;
      const headers = {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Access-Control-Allow-Origin': '*'
      };
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) headers['Content-Length'] = contentLength;

      res.writeHead(200, headers);
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    }

    // 4. Stream Proxy Download (Hỗ trợ Safari iOS Save Video / Web Share API Files)
    if (pathname === '/api/proxy-download') {
      const mediaUrl = parsedUrl.searchParams.get('url');
      const ext = parsedUrl.searchParams.get('ext') || 'mp4';
      const platform = parsedUrl.searchParams.get('platform') || 'video';

      if (!mediaUrl || !mediaUrl.startsWith('http')) {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid media url'
        });
      }

      const upstream = await fetch(mediaUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          Accept: '*/*',
          Referer: mediaUrl.includes('tiktok') || mediaUrl.includes('tikwm')
            ? 'https://www.tikwm.com/'
            : 'https://www.facebook.com/'
        }
      });

      if (!upstream.ok) {
        return sendJson(res, upstream.status, {
          success: false,
          error: `Upstream returned ${upstream.status}`
        });
      }

      const safeName = `ALLDOWN_${platform.toUpperCase()}_${Date.now()}.${ext}`;
      const contentType =
        ext === 'mp3'
          ? 'audio/mpeg'
          : upstream.headers.get('content-type') || 'video/mp4';

      const headers = {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      };
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) headers['Content-Length'] = contentLength;

      res.writeHead(200, headers);
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    }

    // 5. Xuất file cấu hình Apple Shortcut (.plist) & Scriptable (.js)
    if (pathname === '/api/shortcut/alldown.plist') {
      const plist = generateAppleShortcutPlist();
      res.writeHead(200, {
        'Content-Type': 'application/x-plist; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ALLDOWN-SnapVideo.plist"'
      });
      return res.end(plist);
    }

    if (pathname === '/api/shortcut/alldown-scriptable.js') {
      const code = generateScriptableCode();
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ALLDOWN-iOS-Pro.js"'
      });
      return res.end(code);
    }

    // 6. Phục vụ giao diện tĩnh iOS PWA (public/)
    let filePath =
      pathname === '/'
        ? path.join(PUBLIC_DIR, 'index.html')
        : path.join(PUBLIC_DIR, pathname);

    // Chặn Path Traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Fallback SPA
    const indexHtml = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  } catch (err) {
    console.error('[Server Error]:', err);
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Lỗi xử lý trên máy chủ ALLDOWN'
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalLanIp();
  console.log('==============================================================');
  console.log('🚀 ALLDOWN iOS PRO (SNAPVIDEO REBUILD) DA KHOI DONG!');
  console.log(`📱 Truy cap tren PC     : http://localhost:${PORT}`);
  console.log(`📲 Cai len iPhone (WiFi): http://${lanIp}:${PORT}`);
  console.log(`⚡ Link API Phim Tat iOS: http://${lanIp}:${PORT}/api/direct-stream?url=`);
  console.log('==============================================================');
});

