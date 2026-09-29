// 飞书集成：通过本机 lark-cli 查询登录状态、创建云文档
// 全程使用 execFile + 参数数组，不经过 shell 解析，杜绝命令注入
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { BASE_DIR } = require('./config');

const LARK_CLI = 'lark-cli';
const MAX_BUFFER = 10 * 1024 * 1024;

function runLarkCli(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(LARK_CLI, args, { cwd: BASE_DIR, maxBuffer: MAX_BUFFER, ...opts }, (err, stdout, stderr) => {
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
// tokenStatus=needs_refresh 时用户凭证仍可自动续期（CLI 会在下次用户 API 调用时刷新），
// 视为已登录；真正失效（refresh token 过期）时同步调用会失败，前端再引导扫码重登。
async function getLarkStatus() {
  try {
    const { stdout } = await runLarkCli(['whoami']);
    const info = JSON.parse(stdout);
    return {
      available: info.available || false,
      loggedIn: info.tokenStatus === 'ready' || info.tokenStatus === 'needs_refresh',
      tokenStatus: info.tokenStatus,
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

// ── 扫码登录（Device Flow）────────────────────────────────────────
// lark-cli auth login 原生支持设备授权流：
//   1. --no-wait --json 拿到 verification_url + device_code
//   2. auth qrcode 把链接转成 QR PNG（输出路径限 cwd//tmp/~/files，cwd=BASE_DIR）
//   3. 用户扫码后 --device-code 完成授权（pending 期间不返回，靠超时截断后轮询重试）
const QR_IMAGE_NAME = 'feishu_login_qr.png';

async function startQrLogin() {
  const { stdout } = await runLarkCli(['auth', 'login', '--no-wait', '--json']);
  const info = JSON.parse(stdout);
  if (!info.device_code || !info.verification_url) {
    throw new Error('获取飞书授权链接失败：lark-cli 返回缺少 device_code/verification_url');
  }
  const qrAbs = path.join(BASE_DIR, 'public', 'images', QR_IMAGE_NAME);
  await runLarkCli(['auth', 'qrcode', info.verification_url, '--output', qrAbs, '--size', '480']);
  return {
    ok: true,
    qrImage: `./images/${QR_IMAGE_NAME}`,
    verificationUrl: info.verification_url,
    deviceCode: info.device_code,
    expiresIn: info.expires_in || 600
  };
}

// 轮询扫码结果：--device-code 在用户完成前不返回，用 12s 超时截断视为「等待中」
async function pollQrLogin(deviceCode) {
  if (!deviceCode || !/^[A-Za-z0-9._-]{10,500}$/.test(deviceCode)) {
    return { status: 'error', error: '无效的 device code' };
  }
  try {
    const { stdout } = await runLarkCli(['auth', 'login', '--device-code', deviceCode, '--json'], { timeout: 12000 });
    if (stdout && stdout.trim()) {
      try { JSON.parse(stdout); } catch (e) { /* 非 JSON 输出不阻断，以 whoami 为准 */ }
    }
    const status = await getLarkStatus();
    if (status.loggedIn) return { status: 'ready', loggedIn: true, userName: status.userName };
    return { status: 'waiting' };
  } catch (err) {
    const msg = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`.toLowerCase();
    // lark-cli 完成设备授权时以非零码退出并在 stderr 打 "token response received"，视为成功
    if (msg.includes('token response received')) {
      const status = await getLarkStatus();
      if (status.loggedIn) return { status: 'ready', loggedIn: true, userName: status.userName };
      return { status: 'error', error: '授权已完成但未能获取用户信息，请重试' };
    }
    if (err.killed || msg.includes('pending') || msg.includes('waiting') || msg.includes('等待')) {
      return { status: 'waiting' };
    }
    if (msg.includes('expired') || msg.includes('过期')) return { status: 'expired', error: '二维码已过期，请重新扫码' };
    if (msg.includes('denied') || msg.includes('拒绝')) return { status: 'error', error: '授权被拒绝' };
    return { status: 'error', error: `${err.stderr || err.message}`.trim().slice(0, 200) };
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

module.exports = { getLarkStatus, syncToFeishu, startQrLogin, pollQrLogin };
