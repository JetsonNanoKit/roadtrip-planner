// 通用工具：JSON 响应、带体积上限的请求体解析、网络错误格式化
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      received += chunk.length;
      if (received > limit) {
        aborted = true;
        reject(new Error(`请求体过大（超过 ${Math.round(limit / 1024 / 1024)} MB 上限）`));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', err => {
      if (!aborted) reject(err);
    });
  });
}

function formatFetchError(err, targetUrl = '') {
  let detail = err.message;
  if (err.cause) {
    const causeCode = err.cause.code || err.cause.errno || '';
    const causeMsg = err.cause.message || '';
    if (causeCode || causeMsg) {
      detail += ` (${[causeCode, causeMsg].filter(Boolean).join(': ')})`;
    }
  }
  if (err.name === 'AbortError') {
    return `请求超时，接口响应时间过长 (${targetUrl || '接口'})`;
  }
  return `网络请求异常 [${detail}]，请检查网络连接或接口地址是否可达 (${targetUrl || 'API Endpoint'})`;
}

module.exports = { sendJSON, parseBody, formatFetchError, MAX_BODY_BYTES };
