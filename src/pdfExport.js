// 路书 PDF 导出：把前端渲染好的路书 HTML 包成打印样式文档，
// 用本机 Chrome 无头 --print-to-pdf 输出 A4 PDF（图片经本地服务解析）。
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./config');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

function execFilePromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile(cmd, args, { timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve(stdout);
    });
  });
}

// 打印样式：A4 版心、中文字体、图片不超宽、表格/引用/代码块排版、避免标题孤行
function buildPrintHtml({ title, bodyHtml, baseUrl }) {
  const safeTitle = (title || '自驾路书').replace(/[<>&]/g, '');
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<base href="${baseUrl}">
<title>${safeTitle}</title>
<style>
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; }
body {
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: #1e293b; font-size: 11.5pt; line-height: 1.75; margin: 0;
}
h1 { font-size: 20pt; text-align: center; margin: 0 0 4mm; color: #0f172a; }
h2 { font-size: 15pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid #3b82f6; color: #1d4ed8; break-after: avoid; }
h3 { font-size: 12.5pt; margin: 6mm 0 2mm; color: #0f172a; break-after: avoid; }
h4 { font-size: 11.5pt; margin: 4mm 0 1.5mm; color: #334155; break-after: avoid; }
p { margin: 2mm 0; }
ul, ol { margin: 2mm 0; padding-left: 6mm; }
li { margin: 1mm 0; }
blockquote {
  margin: 3mm 0; padding: 2.5mm 4mm; background: #f1f5f9;
  border-left: 3px solid #3b82f6; border-radius: 0 2mm 2mm 0; color: #334155;
}
blockquote p { margin: 1mm 0; }
strong { color: #0f172a; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 5mm 0; }
img { max-width: 100%; height: auto; display: block; margin: 3mm auto; border-radius: 2mm; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 10pt; break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 1.6mm 2.5mm; text-align: left; vertical-align: top; }
th { background: #eff6ff; color: #1e3a8a; }
code { font-family: "SF Mono", Menlo, monospace; background: #f1f5f9; padding: 0 1mm; border-radius: 1mm; font-size: 10pt; }
pre { background: #0f172a; color: #e2e8f0; padding: 3mm; border-radius: 2mm; overflow-x: auto; font-size: 9pt; }
pre code { background: none; color: inherit; padding: 0; }
.footer { margin-top: 10mm; text-align: center; color: #94a3b8; font-size: 9pt; }
</style></head>
<body>
${/^\s*<h1[\s>]/i.test(bodyHtml) ? '' : `<h1>${safeTitle}</h1>`}
${bodyHtml}
<div class="footer">由 RoadTrip Planner 生成 · ${new Date().toLocaleDateString('zh-CN')}</div>
</body></html>`;
}

// 生成 PDF，返回可访问的相对路径 ./exports/xx.pdf
async function exportRoadbookPdf({ title, bodyHtml, baseUrl }) {
  const chrome = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!chrome) throw new Error('未找到 Chrome/Chromium/Edge，无法导出 PDF');

  const exportsDir = path.join(PUBLIC_DIR, 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const stamp = Date.now();
  const safeTitle = (title || 'roadbook').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
  const htmlPath = path.join(exportsDir, `roadbook_${safeTitle}_${stamp}.html`);
  const pdfPath = path.join(exportsDir, `roadbook_${safeTitle}_${stamp}.pdf`);

  fs.writeFileSync(htmlPath, buildPrintHtml({ title, bodyHtml, baseUrl }), 'utf-8');
  try {
    await execFilePromise(chrome, [
      '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`
    ], { maxBuffer: 4 * 1024 * 1024 });
  } finally {
    try { fs.unlinkSync(htmlPath); } catch (e) {}
  }
  if (!fs.existsSync(pdfPath)) throw new Error('PDF 未生成');
  return `./exports/${path.basename(pdfPath)}`;
}

module.exports = { exportRoadbookPdf };
