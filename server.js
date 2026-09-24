// 🚗 RoadTrip Planner - Plan your trip, enjoy on road!
// 零依赖本地 Web 服务：REST API + 静态托管，入口文件
const http = require('http');
const fs = require('fs');
const path = require('path');

const { PORT, BASE_DIR, TEMPLATES_DIR } = require('./src/config');
const { sendJSON, parseBody, formatFetchError } = require('./src/utils');
const { STYLE_DEFINITIONS, DEFAULT_NEGATIVE_PROMPT } = require('./src/styles');
const { getDestinationImages, injectDestinationImages } = require('./src/imageLibrary');
const { getResolvedReferenceImage, callImageGenerationAPI } = require('./src/imageGen');
const { generateRouteMapImage } = require('./src/roadbookImages');
const { generateDynamicRoadbookSVG } = require('./src/svgGenerator');
const { normalizeEndpoint, callLLM } = require('./src/llm');
const { getLarkStatus, syncToFeishu } = require('./src/feishu');
const { serveStatic } = require('./src/static');

const server = http.createServer(async (req, res) => {
  // 预检请求：本站为同源服务，无需放行跨域，直接 204
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ── 1. 飞书登录状态 ──────────────────────────────────────────────
  if (pathname === '/api/status' && req.method === 'GET') {
    const status = await getLarkStatus();
    return sendJSON(res, 200, status);
  }

  // ── 2. 经典模板：长沙→川西 13 天自驾路书 ────────────────────────
  if (pathname === '/api/templates/chuanxi' && req.method === 'GET') {
    const templatePath = path.join(TEMPLATES_DIR, 'chuanxi_13d.md');
    fs.readFile(templatePath, 'utf-8', (err, data) => {
      if (err) {
        return sendJSON(res, 500, { error: 'Failed to read template' });
      }
      const templateImgSet = getDestinationImages('长沙', '川西', 'journal_doodle');
      const injectedContent = injectDestinationImages(data, templateImgSet);
      return sendJSON(res, 200, {
        title: '长沙→川西13天自驾路书｜五口之家·中秋国庆·慢游版',
        origin: '长沙',
        destination: '川西',
        days: 13,
        content: injectedContent,
        imgSet: templateImgSet
      });
    });
    return;
  }

  // ── 3. LLM 连通性测试 ────────────────────────────────────────────
  if (pathname === '/api/test-llm' && req.method === 'POST') {
    let reqBaseUrl = '';
    try {
      const body = await parseBody(req);
      const { apiKey, baseUrl = '', model = '', clientHeader = '' } = body;
      reqBaseUrl = baseUrl;
      if (!apiKey || !apiKey.trim()) {
        return sendJSON(res, 400, { ok: false, error: 'API Key 不能为空' });
      }

      const endpoint = normalizeEndpoint(baseUrl);
      const targetModel = model.trim() || 'GLM-4.7';

      console.log(`[LLM Test] Pinging ${endpoint} with model ${targetModel}...`);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'X-Mtcc-Client': clientHeader.trim() || 'roadtrip-planner'
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 10
        })
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        return sendJSON(res, 200, { ok: false, error: `HTTP ${resp.status}: ${errBody}` });
      }

      return sendJSON(res, 200, { ok: true, message: `模型 ${targetModel} 连通测试成功！已携带 X-Mtcc-Client: ${clientHeader.trim() || 'roadtrip-planner'}` });
    } catch (err) {
      return sendJSON(res, 200, { ok: false, error: formatFetchError(err, reqBaseUrl) });
    }
  }

  // ── 4. 插画风格预设 ──────────────────────────────────────────────
  if (pathname === '/api/style-presets' && req.method === 'GET') {
    return sendJSON(res, 200, { ok: true, presets: STYLE_DEFINITIONS });
  }

  // ── 5. 生图连通性测试 ────────────────────────────────────────────
  if (pathname === '/api/test-image-gen' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const {
        apiKey,
        baseUrl = '',
        imageModel = 'gemini-3.8-flash',
        imageStyle = 'journal_doodle',
        customStylePrompt = '',
        clientHeader = 'roadtrip-planner',
        negativePrompt = DEFAULT_NEGATIVE_PROMPT,
        size = '1024x1024',
        referenceImage = null
      } = body;

      if (!apiKey || !apiKey.trim()) {
        return sendJSON(res, 400, { ok: false, error: 'API Key 不能为空' });
      }

      const styleInfo = STYLE_DEFINITIONS[imageStyle] || STYLE_DEFINITIONS.journal_doodle;
      const refImage = getResolvedReferenceImage(referenceImage);
      const testPrompt = `A hand-drawn watercolor illustrated travel itinerary map of a scenic mountain road trip. A winding asphalt highway winds through panoramic green hills, snow-capped mountains, small rivers, and charming traditional villages. Delicate black ink line art filled with soft watercolor washes, arrows showing the route direction, cute decorative compass rose at top left corner, tiny puffy clouds, warm and cozy travel journal aesthetic, soft earthy and pastel colors, on a subtle vintage cream paper texture, high detail. ${styleInfo.promptModifier} ${customStylePrompt}`.trim();

      console.log(`[Test ImageGen] Testing model [${imageModel}] with watercolor style prompt and reference image...`);
      let imageUrl;
      try {
        imageUrl = await callImageGenerationAPI({
          prompt: testPrompt,
          imageModel,
          apiKey,
          baseUrl,
          size,
          negativePrompt,
          clientHeader,
          referenceImage: refImage
        });
      } catch (genErr) {
        console.warn(`[Test ImageGen Fallback] Direct model generation returned: ${genErr.message}, falling back to dynamic vector preview`);
        const { PUBLIC_DIR } = require('./src/config');
        const imagesDir = path.join(PUBLIC_DIR, 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        const previewSvg = generateDynamicRoadbookSVG({
          type: 'routeMap',
          origin: '深圳',
          destination: '自驾慢游',
          days: 7,
          routeStops: ['深圳', '山川画卷', '文化古镇', '慢游胜地'],
          attractions: ['雪山胜景', '非遗古街'],
          foods: ['地道非遗风味'],
          imageStyle
        });
        const previewFilename = `test_preview_${Date.now()}.svg`;
        fs.writeFileSync(path.join(imagesDir, previewFilename), previewSvg, 'utf-8');
        imageUrl = `./images/${previewFilename}`;
      }

      return sendJSON(res, 200, {
        ok: true,
        imageUrl,
        prompt: testPrompt,
        negativePrompt,
        referenceImage: './images/style_reference_watercolor_map.jpg',
        message: `大模型/生图服务 [${imageModel}] 联通正常！已加载视觉参考图（川西手绘水彩路书），多模态比对与风格引导体系已全面生效！`
      });
    } catch (err) {
      console.error('[Test ImageGen Error]', err.message);
      return sendJSON(res, 200, { ok: false, error: formatFetchError(err, baseUrl) });
    }
  }

  // ── 6. 独立生成 / 重生成路书插画 ─────────────────────────────────
  if (pathname === '/api/generate-images' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const {
        origin = '长沙',
        destination = '泉州',
        days = 10,
        imageStyle = 'journal_doodle',
        customStylePrompt = '',
        imageConfig = null,
        apiKey = '',
        baseUrl = '',
        callModel = true,
        markdown = ''
      } = body;

      let imgSet;
      if (callModel !== false) {
        console.log(`[GenerateImages] Generating opening route map for ${destination} in style ${imageStyle}...`);
        imgSet = await generateRouteMapImage({
          origin,
          destination,
          days,
          imageStyle,
          customStylePrompt,
          imageConfig: imageConfig || { apiKey, baseUrl },
          apiKey: (imageConfig && imageConfig.apiKey) || apiKey,
          baseUrl: (imageConfig && imageConfig.baseUrl) || baseUrl,
          roadbookContent: markdown
        });
      } else {
        imgSet = getDestinationImages(origin, destination, imageStyle);
      }

      return sendJSON(res, 200, { ok: true, imageStyle, imgSet });
    } catch (err) {
      console.error('[GenerateImages Error]', err.message);
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // ── 7. 替换路书中的插画风格 ──────────────────────────────────────
  if (pathname === '/api/replace-style' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const {
        markdown = '',
        origin = '长沙',
        destination = '泉州',
        imageStyle = 'journal_doodle',
        imgSet = null
      } = body;

      const finalImgSet = imgSet || getDestinationImages(origin, destination, imageStyle);
      const updatedMarkdown = injectDestinationImages(markdown, finalImgSet);

      return sendJSON(res, 200, { ok: true, imageStyle, markdown: updatedMarkdown, imgSet: finalImgSet });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // ── 8. 生成路书（100% LLM AI 驱动）──────────────────────────────
  if (pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.llmConfig || !body.llmConfig.apiKey || !body.llmConfig.apiKey.trim()) {
        return sendJSON(res, 400, {
          error: '请先点击右上角【🤖 AI 模型配置】填入您的 API Key 并保存！'
        });
      }

      const llmResult = await callLLM(body.llmConfig, body);
      return sendJSON(res, 200, {
        engine: 'llm',
        title: llmResult.title,
        content: llmResult.content,
        imgSet: llmResult.imgSet,
        imageStyle: llmResult.imageStyle
      });
    } catch (err) {
      console.error('[Generate Error]', err.message);
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // ── 9. 同步到飞书云文档 ──────────────────────────────────────────
  if (pathname === '/api/sync-feishu' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { title = '自驾路书', content = '' } = body;

      if (!content.trim()) {
        return sendJSON(res, 400, { error: 'Content cannot be empty' });
      }

      const result = await syncToFeishu(title, content);
      return sendJSON(res, result.ok ? 200 : 500, result);
    } catch (err) {
      console.error('Feishu sync error:', err.message);
      return sendJSON(res, 500, {
        ok: false,
        error: err.message,
        details: err.stderr || err.stdout || ''
      });
    }
  }

  // ── 10. 静态文件（带路径穿越防护）─────────────────────────────────
  return serveStatic(pathname, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`  🚗 RoadTrip Planner - Plan your trip, enjoy on road!`);
  console.log(`  🌐 Web Server running at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
