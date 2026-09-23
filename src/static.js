// 静态文件服务：带路径穿越防护，仅允许返回 public/ 目录内的文件
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, MIME_TYPES } = require('./config');

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

// pathname 形如 /images/foo.png；任何解码或解析后越出 PUBLIC_DIR 的请求一律 404
function serveStatic(pathname, res) {
  let relPath;
  try {
    relPath = decodeURIComponent(pathname);
  } catch (e) {
    return send404(res);
  }
  if (relPath.includes('\0')) {
    return send404(res);
  }

  const baseName = relPath === '/' ? 'index.html' : relPath;
  const filePath = path.resolve(PUBLIC_DIR, baseName);

  // 关键防护：解析后的绝对路径必须仍位于 PUBLIC_DIR 之内
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return send404(res);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return send404(res);
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = { serveStatic };
