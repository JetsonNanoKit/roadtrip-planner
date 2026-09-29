// fal.ai 系文生图 —— 外采异步网关（Outsourcing Gateway）
// 覆盖两个 path_scene：nanoPro（Nano Banana Pro）与 gptImage2（GPT Image 2）。
// 异步提交 + 轮询，AK/SK 走查询参数，业务方令牌 token 必填。
// 网关接口地址属于部署环境信息，不在代码中硬编码，由配置面板传入
//（imageConfig.imgGatewaySubmit / imgGatewayQuery / imgGatewayQueryDirect）。
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function gatewayUrl(endpoint, apiKey, apiSecret) {
  return `${endpoint}?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`;
}

// 提交 + 轮询直到出图的公共骨架。parameter 里须已带好 app_scene/path_scene/token 等字段。
async function submitAndPollGateway({ apiKey, apiSecret, gatewaySubmit, gatewayQuery, gatewayQueryDirect, parameter, mediaInfoList = [], logTag = 'Gateway' }) {
  if (!gatewaySubmit) throw new Error('请先在配置面板填写网关提交接口地址');
  const body = { media_info_list: mediaInfoList, parameter };

  const submitRes = await fetch(gatewayUrl(gatewaySubmit, apiKey, apiSecret), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
    body: JSON.stringify(body)
  });
  const submitText = await submitRes.text();
  let submitJson;
  try {
    submitJson = JSON.parse(submitText);
  } catch (e) {
    throw new Error(`外采网关提交返回非 JSON (HTTP ${submitRes.status}): ${submitText.slice(0, 200)}`);
  }
  const msgId = submitJson.msg_id;
  if (!submitRes.ok || !msgId) {
    throw new Error(`外采网关提交失败 (HTTP ${submitRes.status}): ${submitJson.error_msg || submitText.slice(0, 200)}`);
  }
  console.log(`[${logTag}] task submitted: ${msgId}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastMsg = '';
  let notFoundStreak = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    // 优先直连网关查询（存储一致、无需鉴权）；未配置或网络不通时回退 openapi 查询
    let qJson = null;
    let qVia = 'direct';
    try {
      if (!gatewayQueryDirect) throw new Error('direct query url not configured');
      const dRes = await fetch(gatewayQueryDirect, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
        body: JSON.stringify({ msg_id: msgId })
      });
      qJson = await dRes.json();
    } catch (e) {
      if (!gatewayQuery) throw new Error('请先在配置面板填写网关查询接口地址');
      qVia = 'openapi';
      const qRes = await fetch(gatewayUrl(gatewayQuery, apiKey, apiSecret), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
        body: JSON.stringify({ msg_id: msgId })
      });
      const qText = await qRes.text();
      try {
        qJson = JSON.parse(qText);
      } catch (e2) {
        throw new Error(`外采网关查询返回非 JSON (HTTP ${qRes.status}): ${qText.slice(0, 200)}`);
      }
    }
    const code = qJson.error_code;
    lastMsg = qJson.error_msg || '';
    console.log(`[${logTag}] poll via=${qVia} msgId=...${msgId.slice(-12)} error_code=${code} msg=${lastMsg}`);
    if (code === 0) {
      const param = qJson.parameter || {};
      const data = param.data || param.images || [];
      const first = data[0] || {};
      if (first.url) return first.url;
      if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
      throw new Error('外采网关成功但无图片数据');
    }
    if (code === 4 || code === 5 || code === 94) continue; // 进行中，继续轮询
    // 29900 RECORD_NOT_FOUND：提交后查询侧可能有秒级同步延迟，前 90 秒容忍
    if (code === 29900 && ++notFoundStreak <= 30) continue;
    throw new Error(`外采网关生图失败 (error_code ${code}): ${lastMsg || '未知错误'}`);
  }
  throw new Error('外采网关生图超时（5 分钟未出图）');
}

// ── Nano Banana Pro ──────────────────────────────────────────────
// imageBase64List: 不含 data: 前缀的 base64 输入图（如风格参考图，随请求直传）
async function callNanoBanana({
  apiKey,
  apiSecret,
  token,
  model = 'nano-banana-pro',
  prompt,
  resolution = '2K',
  aspectRatio = '16:9',
  imageBase64List = [],
  outputFormat = 'png',
  isTranslate = true,
  gatewaySubmit = '',
  gatewayQuery = '',
  gatewayQueryDirect = ''
}) {
  if (!apiKey || !apiSecret) throw new Error('请先填写外采网关 API Key (AK/SK)');
  if (!token) throw new Error('请填写外采网关业务令牌 (token)');

  const parameter = {
    app_scene: 'fal',
    path_scene: 'nanoPro',
    token,
    model,
    prompt: prompt || '',
    num_images: 1,
    resolution,
    aspect_ratio: aspectRatio,
    is_translate: isTranslate,
    output_format: outputFormat
  };
  if (imageBase64List.length) {
    parameter.base64s = imageBase64List.map(b => `data:image/jpeg;base64,${b}`);
  }

  return submitAndPollGateway({
    apiKey,
    apiSecret,
    gatewaySubmit,
    gatewayQuery,
    gatewayQueryDirect,
    parameter,
    mediaInfoList: imageBase64List.map(b64 => ({
      media_data: b64,
      media_profiles: { media_data_type: 'base64' }
    })),
    logTag: 'NanoBanana'
  });
}

// ── GPT Image 2 ──────────────────────────────────────────────────
// 注意：该模型参考图仅支持可公开访问的 http/https URL（不支持 base64），
// 本地水彩参考图无法随请求携带，风格完全由提示词描述承载。
// size 显式 "宽x高"：宽高须为 16 的倍数、比例 1:3~3:1、最长边 ≤3840、总像素 655360~8294400。
function gptImageSize(resolution = '2K', aspectRatio = '16:9') {
  const table = {
    '1K': { '16:9': '1344x768', '9:16': '768x1344', auto: '1024x1024' },
    '2K': { '16:9': '2560x1440', '9:16': '1440x2560', auto: '2048x2048' },
    '4K': { '16:9': '3840x2160', '9:16': '2160x3840', auto: '2880x2880' }
  };
  return (table[resolution] && table[resolution][aspectRatio]) || table['2K']['16:9'];
}

async function callGptImage2({
  apiKey,
  apiSecret,
  token,
  model = 'gpt-image-2',
  prompt,
  resolution = '2K',
  aspectRatio = '16:9',
  outputFormat = 'png',
  isTranslate = false,
  quality = 'high',
  gatewaySubmit = '',
  gatewayQuery = '',
  gatewayQueryDirect = ''
}) {
  if (!apiKey || !apiSecret) throw new Error('请先填写外采网关 API Key (AK/SK)');
  if (!token) throw new Error('请填写外采网关业务令牌 (token)');

  const size = gptImageSize(resolution, aspectRatio);
  console.log(`[GptImage2] model=${model} size=${size} quality=${quality} (本地参考图不支持，仅文生图)`);

  return submitAndPollGateway({
    apiKey,
    apiSecret,
    gatewaySubmit,
    gatewayQuery,
    gatewayQueryDirect,
    parameter: {
      app_scene: 'fal',
      path_scene: 'gptImage2',
      token,
      model,
      prompt: prompt || '',
      number: 1,
      size,
      quality,
      is_translate: isTranslate,
      output_format: outputFormat
    },
    // 文档示例：文生图也带一个空 url 媒体位
    mediaInfoList: [{ media_data: '', media_profiles: { media_data_type: 'url' } }],
    logTag: 'GptImage2'
  });
}

function isNanoBananaModel(model) {
  return (model || '').toLowerCase().includes('nano-banana');
}

function isGptImageModel(model) {
  return (model || '').toLowerCase().includes('gpt-image');
}

module.exports = { callNanoBanana, callGptImage2, isNanoBananaModel, isGptImageModel, gptImageSize };
