// 飞书集成：通过本机 lark-cli 查询登录状态、创建云文档
// 全程使用 execFile + 参数数组，不经过 shell 解析，杜绝命令注入
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { BASE_DIR } = require('./config');

const LARK_CLI = 'lark-cli';
const MAX_BUFFER = 10 * 1024 * 1024;

function runLarkCli(args) {
  return new Promise((resolve, reject) => {
    execFile(LARK_CLI, args, { cwd: BASE_DIR, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

// 查询 lark-cli 可用性与登录状态
async function getLarkStatus() {
  try {
    const { stdout } = await runLarkCli(['whoami']);
    const info = JSON.parse(stdout);
    return {
      available: info.available || false,
      loggedIn: info.tokenStatus === 'ready',
      identity: info.identity || 'user',
      userName: info.onBehalfOf ? info.onBehalfOf.userName : '已授权用户',
      openId: info.onBehalfOf ? info.onBehalfOf.openId : '',
      appId: info.appId,
      brand: info.brand || 'feishu'
    };
  } catch (err) {
    return { available: false, loggedIn: false, error: err.message };
  }
}

// 将路书 Markdown 同步为飞书云文档，返回 { ok, title, docUrl, docId, raw }
async function syncToFeishu(title, content) {
  const cleanTitle = String(title || '自驾路书').slice(0, 200);
  const cleanContent = String(content || '');

  // 将 Markdown 中的本地图片路径改写为 @./public/images/...，
  // lark-cli 会自动把这些图片上传到飞书文档
  const feishuContent = cleanContent
    .replace(/\]\(\.\/images\//g, '](@./public/images/')
    .replace(/\]\(\/images\//g, '](@./public/images/')
    .replace(/\]\(images\//g, '](@./public/images/');

  const tempFile = path.join(BASE_DIR, `temp_sync_${Date.now()}_${process.pid}.md`);
  fs.writeFileSync(tempFile, feishuContent, 'utf-8');

  try {
    const { stdout } = await runLarkCli([
      'docs', '+create',
      '--title', cleanTitle,
      '--doc-format', 'markdown',
      '--content', `@./${path.basename(tempFile)}`,
      '--as', 'user'
    ]);

    try {
      const resObj = JSON.parse(stdout);
      let docUrl = '';
      let docId = '';
      if (resObj.data && resObj.data.document) {
        docUrl = resObj.data.document.url;
        docId = resObj.data.document.document_id;
      } else if (resObj.url) {
        docUrl = resObj.url;
        docId = resObj.document_id;
      }
      return { ok: true, title: cleanTitle, docUrl, docId, raw: resObj };
    } catch (parseErr) {
      return { ok: true, title: cleanTitle, rawOutput: stdout };
    }
  } finally {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (e) { /* 临时文件清理失败可忽略 */ }
  }
}

module.exports = { getLarkStatus, syncToFeishu };
