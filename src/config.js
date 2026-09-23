// 全局配置：端口、目录与 MIME 类型
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;

// src/ 位于项目根目录下一层，因此 BASE_DIR 需要向上回退一级
const BASE_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const TEMPLATES_DIR = path.join(BASE_DIR, 'templates');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

module.exports = { PORT, BASE_DIR, PUBLIC_DIR, TEMPLATES_DIR, MIME_TYPES };
