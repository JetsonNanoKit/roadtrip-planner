// AI 生图 API 调用层：Vertex Express / Gemini / Imagen / OpenAI 兼容接口，含风格参考图处理与图片落盘
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { DEFAULT_NEGATIVE_PROMPT } = require('./styles');
const { formatFetchError } = require('./utils');

// Vertex Express / Gemini / Imagen API Caller & Visual Reference Handler
const DEFAULT_REF_IMAGE_PATH = path.join(PUBLIC_DIR, 'images', 'style_reference_watercolor_map.jpg');
let DEFAULT_REF_BASE64 = null;
try {
  if (fs.existsSync(DEFAULT_REF_IMAGE_PATH)) {
    const buf = fs.readFileSync(DEFAULT_REF_IMAGE_PATH);
    DEFAULT_REF_BASE64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
    console.log(`[Reference Image] Loaded style reference image: ${DEFAULT_REF_IMAGE_PATH} (${Math.round(buf.length / 1024)} KB)`);
  }
} catch (err) {
  console.warn('[Reference Image] Failed to load default reference image:', err.message);
}

function getResolvedReferenceImage(customRef) {
  if (customRef && typeof customRef === 'string') {
    if (customRef.startsWith('data:image/')) return customRef;
    if (customRef.startsWith('http://') || customRef.startsWith('https://')) return customRef;
    if (fs.existsSync(customRef)) {
      try {
        const buf = fs.readFileSync(customRef);
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch (e) {}
    }
  }
  return DEFAULT_REF_BASE64;
}

// Vertex Express / Gemini / Imagen API Caller
async function callVertexExpressGenerateContent({ prompt, imageModel, apiKey, baseUrl, size, referenceImage = null }) {
  let cleanBase = (baseUrl || 'https://model-router.meitu.com/v1').trim().replace(/\/+$/, '');
  cleanBase = cleanBase.replace(/\/(?:chat\/completions|images\/generations)$/, '');

  let endpoint;
  if (cleanBase.endsWith('/models')) {
    endpoint = `${cleanBase}/${imageModel}:generateContent`;
  } else {
    endpoint = `${cleanBase}/models/${imageModel}:generateContent`;
  }

  const refImage = getResolvedReferenceImage(referenceImage);
  const cleanRefB64 = refImage ? refImage.replace(/^data:image\/[a-z]+;base64,/, '') : null;

  console.log(`[Vertex Express] Calling ${endpoint} with model ${imageModel} (reference image: ${Boolean(refImage)})...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  // 1. Attempt Native Image Modality (e.g. gemini-2.5-flash-image, imagen-3.0, or image-capable preview models)
  try {
    const nativeParts = [{ text: prompt }];
    if (cleanRefB64) {
      nativeParts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: cleanRefB64
        }
      });
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: nativeParts
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio: size && size.includes('1024x1024') ? '1:1' : '16:9'
          }
        }
      }),
      signal: controller.signal
    });

    if (res.ok) {
      const json = await res.json();
      // Check inlineData (standard Gemini native image output)
      if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
        for (const part of json.candidates[0].content.parts) {
          if (part.inlineData) {
            clearTimeout(timeoutId);
            const mime = part.inlineData.mimeType || 'image/png';
            return `data:${mime};base64,${part.inlineData.data}`;
          }
          if (part.inline_data) {
            clearTimeout(timeoutId);
            const mime = part.inline_data.mime_type || 'image/png';
            return `data:${mime};base64,${part.inline_data.data}`;
          }
        }
      }
      // Check Vertex Imagen format (predictions)
      if (json.predictions && json.predictions[0]) {
        const pred = json.predictions[0];
        const b64 = pred.bytesBase64Encoded || pred.b64_json;
        const mime = pred.mimeType || 'image/png';
        if (b64) {
          clearTimeout(timeoutId);
          return `data:${mime};base64,${b64}`;
        }
      }
    } else {
      const errText = await res.text();
      console.warn(`[Vertex Express] Native image modality attempt returned ${res.status}: ${errText.substring(0, 150)}`);
    }
  } catch (err) {
    console.warn(`[Vertex Express] Native image attempt error: ${err.message}`);
  }

  // 2. Attempt Dynamic Vector Hand-drawn SVG Illustration Generation
  console.log(`[Vertex Express] Requesting custom vector watercolor travel map illustration from ${imageModel}...`);
  const svgPrompt = `You are a master watercolor travel book illustrator and visual cartographer.
You are provided with a visual style reference image ('川西小环线13天自驾路书' hand-drawn watercolor travel map).
Please carefully analyze the reference image's visual style, color palette, and composition:
1. Palette & Texture: Delicate black ink outlines (pen and watercolor sketch stroke="#2B3A42"), soft watercolor wash fills, subtle off-white textured paper (#FAF7F0 or #FDFBF7), low-saturation earthy & pastel color palette (sage green #8FA89B, mountain blue #6B8E9B, warm ochre #C68B59, terracotta #D9826C, snow white #FAF8F5).
2. Composition & Perspective: Isometric miniature landscape view (微缩半鸟瞰等轴视角), winding scenic highway/path connecting landmarks with directional arrows (➔).
3. Core Elements: Miniature landmarks (snow-capped mountains, ancient pavilions with flying eaves, stone bridges, pine trees, cute yellow SUV with luggage), vintage decorative compass rose in corner, botanical border doodles, cute soft puffy watercolor clouds, hand-lettered badge tags.
4. Technical: Valid XML SVG with <defs>, <linearGradient>, <filter>, <path>, <rect>, <circle>, <polygon>, <text>, <g>. Root element: <svg viewBox="0 0 1200 675" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">.
5. Negative Constraints: Strictly avoid photorealistic, photo, 3d render, CGI, dark lighting, messy sketch, neon colors, modern GPS navigation UI, high contrast, oversaturated.
6. OUTPUT: Output ONLY the complete <svg>...</svg> code inside \`\`\`xml or \`\`\`svg codeblock for this road trip highlight:
"${prompt}"`;

  try {
    const svgParts = [{ text: svgPrompt }];
    if (cleanRefB64) {
      svgParts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: cleanRefB64
        }
      });
    }

    const resSvg = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: svgParts
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resSvg.ok) {
      const errBody = await resSvg.text();
      throw new Error(`Vertex 接口错误 (${resSvg.status}): ${errBody}`);
    }

    const svgJson = await resSvg.json();
    if (svgJson.candidates && svgJson.candidates[0] && svgJson.candidates[0].content && svgJson.candidates[0].content.parts) {
      for (const part of svgJson.candidates[0].content.parts) {
        if (part.text) {
          const svgMatch = part.text.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            return `data:image/svg+xml;utf8,${encodeURIComponent(svgMatch[0])}`;
          }
        }
      }
    }
  } catch (svgErr) {
    clearTimeout(timeoutId);
    throw new Error(`Vertex 插画生成失败: ${svgErr.message}`);
  }
  clearTimeout(timeoutId);

  throw new Error('生图模型未能返回有效图片或矢量插画');
}

// Universal Image Generation API Caller
// Intelligently supports:
// 1. Google Gemini / Vertex Express (:generateContent for gemini-3.8-flash, gemini-3.5-flash, etc.)
// 2. Vertex Imagen (:predict / :generateContent for imagen-3.0)
// 3. OpenAI-compatible /v1/images/generations (DALL-E 3, FLUX, Stable Diffusion, etc.) with Reference Image & Negative Prompt
// 4. OpenAI-compatible /v1/chat/completions (for multimodal LLMs like GLM-4.7, gemini-3.8-flash receiving Reference Image as base64 image_url)
async function callImageGenerationAPI({
  prompt,
  imageModel,
  apiKey,
  baseUrl,
  size = '1792x1024',
  negativePrompt = DEFAULT_NEGATIVE_PROMPT,
  clientHeader = 'roadtrip-planner',
  referenceImage = null
}) {
  const model = (imageModel || 'gemini-3.8-flash').trim();
  const cleanBase = (baseUrl || 'http://model-router-biz.meitu.com/v1').trim().replace(/\/+$/, '');
  const refImage = getResolvedReferenceImage(referenceImage);

  const isGoogleVertex = 
    cleanBase.includes('generativelanguage.googleapis.com') || 
    cleanBase.includes('aiplatform.googleapis.com');

  // If it's a native Google Vertex/AI Studio endpoint, route to Vertex Express handler
  if (isGoogleVertex) {
    return await callVertexExpressGenerateContent({ prompt, imageModel: model, apiKey, baseUrl: cleanBase, size, referenceImage: refImage });
  }

  // Check if target model is a dedicated diffusion model (DALL-E, Flux, Stable Diffusion, Imagen, CogView, SDXL)
  const isDiffusion = 
    model.toLowerCase().includes('dall-e') || 
    model.toLowerCase().includes('flux') || 
    model.toLowerCase().includes('imagen') || 
    model.toLowerCase().includes('stable-diffusion') || 
    model.toLowerCase().includes('sdxl') || 
    model.toLowerCase().includes('midjourney') || 
    model.toLowerCase().includes('cogview');

  if (isDiffusion) {
    let endpoint = cleanBase;
    if (!endpoint.endsWith('/images/generations')) {
      if (endpoint.endsWith('/v1')) {
        endpoint = `${endpoint}/images/generations`;
      } else if (endpoint.endsWith('/chat/completions')) {
        endpoint = endpoint.replace('/chat/completions', '/images/generations');
      } else {
        endpoint = `${endpoint}/images/generations`;
      }
    }

    const refPrefix = refImage ? '[Style Reference: Hand-drawn Watercolor Travel Map "川西小环线13天自驾路书", pen ink outlines, soft watercolor washes, miniature isometric terrain]. ' : '';
    const fullPrompt = (model.toLowerCase().includes('dall-e') && negativePrompt)
      ? `${refPrefix}${prompt}. Negative constraints: strictly avoid ${negativePrompt}.`
      : `${refPrefix}${prompt}`;

    console.log(`[ImageGen Diffusion] Calling ${endpoint} with model ${model} (refImage attached: ${Boolean(refImage)})...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    const bodyPayload = {
      model: model,
      prompt: fullPrompt,
      n: 1,
      size: size,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {})
    };

    if (refImage) {
      bodyPayload.image = refImage;
      bodyPayload.image_url = refImage;
      bodyPayload.reference_image = refImage;
      bodyPayload.init_images = [refImage];
    }

    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'X-Mtcc-Client': clientHeader.trim() || 'roadtrip-planner'
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      throw new Error(formatFetchError(err, endpoint));
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`生图接口错误 (${res.status}): ${errText}`);
    }

    const json = await res.json();
    if (json.data && json.data[0]) {
      if (json.data[0].url) {
        return json.data[0].url;
      } else if (json.data[0].b64_json) {
        return `data:image/png;base64,${json.data[0].b64_json}`;
      }
    }
    throw new Error('生图返回数据中未包含有效图片');
  }

  // For chat completion LLMs on OpenAI-compatible router (e.g. gemini-3.8-flash, gemini-3.5-flash, GLM-4.7 on model-router-biz.meitu.com)
  // Deliver the style reference image as multimodal base64 image_url, and request exquisite vector watercolor travel map SVG!
  let chatEndpoint = cleanBase;
  if (!chatEndpoint.endsWith('/chat/completions')) {
    if (chatEndpoint.endsWith('/v1')) chatEndpoint = `${chatEndpoint}/chat/completions`;
    else if (chatEndpoint.endsWith('/images/generations')) chatEndpoint = chatEndpoint.replace('/images/generations', '/chat/completions');
    else chatEndpoint = `${chatEndpoint}/chat/completions`;
  }

  console.log(`[ImageGen Multimodal LLM] Calling ${chatEndpoint} with model ${model} (refImage attached: ${Boolean(refImage)})...`);
  const svgSystemPrompt = `You are a master hand-drawn watercolor travel-book illustrator and pictorial map artist.
Your task: create ONE rich, dense, hand-painted watercolor "road trip route map" (出游路线手绘地图) as a standalone SVG, closely imitating the provided reference image's art style, composition density and charm.

ART STYLE RULES (must imitate the reference image):
1. Medium & Line: hand-drawn pen-and-ink outlines (dark ink #2B3A42, slightly wobbly organic strokes, NOT mathematically perfect), filled with soft translucent watercolor washes on warm cream textured paper (#FAF7F0) that covers the ENTIRE canvas — never leave a plain pure-white background.
2. Palette: low-saturation earthy pastels — sage green #8FA89B, mountain blue #6B8E9B, warm ochre #C68B59, terracotta #D9826C, autumn orange #D98E4A, snow white #FAF8F5.
3. Watercolor feel (critical): fake real watercolor with SVG filters — paper grain via feTurbulence + feDisplacementMap, wobbly ink edges via small feDisplacementMap on outline groups, layered wash shapes at 30-60% opacity for depth, soft feathered wash edges via feGaussianBlur. Every color area must show wash texture — NO flat solid fills.
4. Density (critical): the map must be RICH and FULL like the reference image — background layered mountain ranges (3-4 receding layers, snowcaps on high peaks), a winding double-line road with directional arrows and highway shields, EVERY stop on the itinerary gets its own miniature landmark vignette (ancient pavilions with flying eaves, pagodas, stone towers, arched bridges, lakes/rivers, temples, old streets, local food stalls, famous statues or mascots of that place), clusters of pine trees and autumn trees along the route, drifting hand-drawn clouds, a vintage 8-point compass rose (top-left), decorative flowers/leaves/plants framing the corners, a cute small car with luggage driving on the road, a small red dot on the road at EVERY stop, and bilingual (Chinese + English) hand-lettered labels with tiny location pins for every stop — labels sit directly on the map like handwriting, NOT inside UI boxes.
5. Composition: panoramic pictorial map; origin on the left, destination on the right; the route winds across the whole canvas through all stops in order; a hand-lettered ribbon title banner at the top.
6. Negative: strictly NO photorealism, NO 3D render, NO neon colors, NO dark UI panels, NO modern GPS navigation look, NO plain flat minimalist vector style, NO legend box, NO info panels, NO rounded-rectangle label badges, NO drop shadows, NO sharp geometric infographic shapes.
7. Technical: root element <svg viewBox="0 0 1600 900" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">. Fully valid XML with <defs> (gradients + watercolor filters), <g>, <path>, <rect>, <circle>, <ellipse>, <polygon>, <text> (font-family="PingFang SC, Microsoft YaHei, sans-serif"). Chinese text must render correctly (no escaped entities needed beyond XML basics). Do NOT use XML comments anywhere.
8. Output: output ONLY the complete <svg>...</svg> code inside a single \`\`\`svg codeblock. No planning, no commentary, no explanations before or after the codeblock — nothing but the SVG. You have a large token budget (32k) — use it: richness and completeness matter far more than brevity. Do NOT stop early; if detail must be sacrificed, sacrifice minor decorations, never the route, stops, landmarks or title.`;

// 截断/脏输出 SVG 修复：
// 0) 先剥离 markdown 围栏与纯散文行（思考型模型爱在输出里夹带计划废话）；
// 1) 若任意位置出现过 </svg>（模型在中间闭合后又写了废话），截取到第一个 </svg> 为止；
// 2) 真正被截断时：去掉末尾半个标签，用栈补全未闭合的元素，最后闭合 </svg>；
// 3) 清洗：删除 XML 注释（注释内禁止出现 --），转义裸 &。
function repairTruncatedSvg(text) {
  // 0) 只保留含 '<' 的行（标签行），丢弃 markdown 围栏（含围栏内的内容）与纯散文行
  let inFence = false;
  const markupLines = text.split('\n').filter(line => {
    const t = line.trim();
    if (t.startsWith('```')) { inFence = !inFence; return false; }
    if (inFence || !t) return false;
    return t.includes('<');
  });
  text = markupLines.join('\n');

  const start = text.indexOf('<svg');
  if (start < 0) return null;
  let svg = text.slice(start);
  const firstClose = svg.indexOf('</svg>');
  if (firstClose >= 0) {
    return svg.slice(0, firstClose + '</svg>'.length);
  }
  // 去掉末尾未写完的半个标签（如 `<rect x="12` 或孤立的 `<`）
  svg = svg.replace(/<[^<>]*$/, '');
  // 若遗留未闭合的属性引号（散文行被抽掉导致），截掉这个残标签
  svg = svg.replace(/<[a-zA-Z][\w:-]*(?:\s+[\w:-]*=(?:"[^"]{0,200}|'[^']{0,200}))?\s*$/, '');
  // 栈式扫描，记录未闭合的开启标签
  const stack = [];
  const tagRe = /<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  while ((m = tagRe.exec(svg)) !== null) {
    const full = m[0];
    const name = m[1];
    if (name === 'svg') continue; // 根元素不入栈，由函数末尾统一闭合
    if (full.startsWith('</')) {
      // 与栈顶匹配则弹出（容忍模型偶尔的标签不匹配）
      if (stack[stack.length - 1] === name) stack.pop();
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
  }
  while (stack.length > 0) {
    svg += `</${stack.pop()}>`;
  }
  svg += '</svg>';
  return svg;
}

// SVG 清洗：1) 删除 XML 注释（模型爱在注释里写 ----，而 XML 注释禁止出现 --）；
// 2) 把不是合法实体的裸 & 转成 &amp;（text/attribute 通用）
function sanitizeSvgEntities(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

  const userContent = [
    {
      type: 'text',
      text: `The attached image is a style reference: a rich hand-drawn watercolor Chinese road-trip route map ('川西小环线13天自驾路书').
Study its density and charm: layered mountains with snowcaps, a winding road with arrows and highway shields, every stop drawn as its own miniature landmark vignette, pine and autumn trees, clouds, a vintage compass rose, corner botanical decorations, a cute car with luggage, and bilingual hand-lettered label badges with pins.

Now read the following complete road trip itinerary (full text), and draw ONE route map in exactly this reference style — show EVERY stop in order with its characteristic landmark, the road winding from origin to destination, and a hand-lettered title banner:

${prompt}

Negative Constraints: ${negativePrompt}`
    }
  ];

  if (refImage) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: refImage.startsWith('data:') ? refImage : `data:image/jpeg;base64,${refImage}`
      }
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 精细插画耗时较长，放宽至 5 分钟

  let res;
  try {
    res = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'X-Mtcc-Client': clientHeader.trim() || 'roadtrip-planner'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: svgSystemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3,
        max_tokens: 32768
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(formatFetchError(err, chatEndpoint));
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 插画接口错误 (${res.status}): ${errText}`);
  }

  const json = await res.json();
  if (json.choices && json.choices[0] && json.choices[0].message) {
    const choice = json.choices[0];
    let text = choice.message.content || '';
    // 思维链模型可能把 SVG 放进 reasoning_content
    if (!text.includes('<svg') && choice.message.reasoning_content) {
      text = choice.message.reasoning_content;
    }
    let svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch && text.includes('<svg') && choice.finish_reason === 'length') {
      // 输出被 max_tokens 截断：修复后兜底解析
      console.warn('[ImageGen Multimodal LLM] SVG output truncated by token limit, attempting repair');
      const repaired = repairTruncatedSvg(text);
      svgMatch = repaired ? repaired.match(/<svg[\s\S]*<\/svg>/i) : null;
    }
    if (svgMatch) {
      const svg = sanitizeSvgEntities(svgMatch[0]);
      // 质量门：模型偶尔返回 `...` 占位符或极小的应付式 SVG，视为无效走兜底
      if (svg.length < 1500 || svg.includes('...')) {
        throw new Error(`LLM 返回的 SVG 无效（${svg.length}B，含占位符），触发兜底`);
      }
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
  }
  throw new Error('LLM 未能输出有效的 <svg> 矢量插画代码');
}

// Download and cache image locally to public/images/ (supports PNG, JPG, and SVG)
async function downloadAndSaveImage(imageUrlOrBase64, filename) {
  const imagesDir = path.join(PUBLIC_DIR, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  if (imageUrlOrBase64.startsWith('data:image/svg+xml')) {
    let svgContent = imageUrlOrBase64.replace(/^data:image\/svg\+xml;(?:utf8,)?/, '');
    try {
      svgContent = decodeURIComponent(svgContent);
    } catch (e) {}
    const svgFilename = filename.replace(/\.(png|jpg|jpeg)$/, '.svg');
    const svgPath = path.join(imagesDir, svgFilename);
    await fs.promises.writeFile(svgPath, svgContent, 'utf-8');
    return `./images/${svgFilename}`;
  }

  if (imageUrlOrBase64.startsWith('data:image/')) {
    const match = imageUrlOrBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    const ext = match ? match[1] : 'png';
    const cleanFilename = filename.replace(/\.\w+$/, `.${ext}`);
    const base64Data = match ? match[2] : imageUrlOrBase64.replace(/^data:image\/\w+;base64,/, '');
    const targetPath = path.join(imagesDir, cleanFilename);
    await fs.promises.writeFile(targetPath, Buffer.from(base64Data, 'base64'));
    return `./images/${cleanFilename}`;
  } else {
    const res = await fetch(imageUrlOrBase64);
    if (!res.ok) throw new Error(`下载生成图片失败: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const targetPath = path.join(imagesDir, filename);
    await fs.promises.writeFile(targetPath, buffer);
    return `./images/${filename}`;
  }
}

// ── SVG → PNG 本地光栅化 ──────────────────────────────────────────────
// 该模型路由器无原生出图能力，AI 输出为 SVG 代码；用本机 Chrome 无头渲染
// 转成普通位图（2x 清晰度），qlmanage 作为应急兜底。
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

function execFilePromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile(cmd, args, { timeout: 60000, ...opts }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve(stdout);
    });
  });
}

// 读取 SVG 的 viewBox 决定渲染窗口尺寸（按比例），返回 PNG 绝对路径
// 渲染时套一层「水彩手账」后期：米白水彩纸纹理背景 + 手绘抖动滤镜，
// 把模型输出的偏平涂矢量感压成参考图的钢笔淡彩纸面质感。
const PAPER_TEXTURE_PATH = path.join(PUBLIC_DIR, 'images', 'paper_texture.jpg');

async function convertSvgFileToPng(svgPath) {
  let svgContent = fs.readFileSync(svgPath, 'utf-8');
  // 安全兜底：内联进 HTML 前剥掉可能的脚本
  svgContent = svgContent.replace(/<script[\s\S]*?<\/script>/gi, '');
  const vb = (svgContent.match(/viewBox\s*=\s*"([^"]+)"/i) || [])[1];
  const parts = vb ? vb.trim().split(/[\s,]+/) : null;
  let w = 1600, h = 900;
  if (parts && parts.length === 4 && Number(parts[2]) > 0 && Number(parts[3]) > 0) {
    w = Math.round(Number(parts[2]));
    h = Math.round(Number(parts[3]));
  }

  const hasPaper = fs.existsSync(PAPER_TEXTURE_PATH);
  if (hasPaper) {
    // 1) 强制纸面底色：模型常自作主张画深色/纯白底，把根级全幅 rect 背景
    //    剥掉，统一换成米白水彩纸（底色层 + 纸纹理 <image>）。
    //    只在「第一个 <g 之前」的头部区域操作，并保护 <defs> 里的 rect（clip/mask）。
    const gIdx = svgContent.search(/<g[\s>]/i);
    if (gIdx > 0) {
      let header = svgContent.slice(0, gIdx);
      const defsBlocks = [];
      header = header.replace(/<defs[\s\S]*?<\/defs>/gi, (m) => { defsBlocks.push(m); return `\x00DEFS${defsBlocks.length - 1}\x00`; });
      header = header.replace(/<rect\b[^>]*(?:\/>|>(?:(?!<\/?rect\b)[\s\S])*?<\/rect>)/gi, (m) => {
        const attr = (name) => { const mm = m.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i')); return mm ? parseFloat(mm[1]) : null; };
        const rx = attr('x') || 0, ry = attr('y') || 0;
        const rw = attr('width'), rh = attr('height');
        if (rw && rh && rw >= w * 0.95 && rh >= h * 0.95 && rx <= w * 0.05 && ry <= h * 0.05) return ''; // 全幅背景，剥掉
        return m;
      });
      header = header.replace(/\x00DEFS(\d+)\x00/g, (m, i) => defsBlocks[Number(i)]);
      svgContent = header + svgContent.slice(gIdx);
    }
    // 2) 在 <svg ...> 开标签后注入纸面底层（先画者居底）
    const svgOpenEnd = svgContent.indexOf('>', svgContent.search(/<svg[\s>]/i));
    if (svgOpenEnd > 0) {
      const paperLayer = `<rect x="0" y="0" width="${w}" height="${h}" fill="#FAF7F0"/><image href="paper_texture.jpg" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.9"/>`;
      svgContent = svgContent.slice(0, svgOpenEnd + 1) + paperLayer + svgContent.slice(svgOpenEnd + 1);
    }
  }

  const pngPath = svgPath.replace(/\.svg$/i, '.png');
  const chrome = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (chrome) {
    let renderTarget = `file://${svgPath}`;
    let wrapHtmlPath = null;
    if (hasPaper) {
      wrapHtmlPath = svgPath.replace(/\.svg$/i, '.wrap.html');
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:#FAF7F0}
body{background:#FAF7F0 url('file://${PAPER_TEXTURE_PATH}') center/cover no-repeat}
#journal-map{width:${w}px;height:${h}px;filter:url(#handWobble)}
</style></head><body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<filter id="handWobble" x="-5%" y="-5%" width="110%" height="110%">
<feTurbulence type="fractalNoise" baseFrequency="0.012 0.017" numOctaves="2" seed="11" result="noise"/>
<feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/>
</filter>
</svg>
<div id="journal-map">
${svgContent}
</div>
</body></html>`;
      fs.writeFileSync(wrapHtmlPath, html, 'utf-8');
      renderTarget = `file://${wrapHtmlPath}`;
      if (process.env.RTP_DEBUG) fs.writeFileSync(`${svgPath}.debug.svg`, svgContent, 'utf-8');
    }
    try {
      await execFilePromise(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
        `--screenshot=${pngPath}`, `--window-size=${w},${h}`, renderTarget
      ], { maxBuffer: 1024 * 1024 });
    } finally {
      if (wrapHtmlPath && fs.existsSync(wrapHtmlPath)) fs.unlinkSync(wrapHtmlPath);
    }
  } else {
    // qlmanage 应急兜底（会产生方形白边）
    await execFilePromise('qlmanage', ['-t', '-s', String(Math.max(w, h)), '-o', path.dirname(svgPath), svgPath]);
    const produced = `${svgPath}.png`;
    if (!fs.existsSync(produced)) throw new Error('qlmanage 未产出缩略图');
    fs.renameSync(produced, pngPath);
  }
  if (!fs.existsSync(pngPath)) throw new Error('PNG 未生成');
  return pngPath;
}

module.exports = { getResolvedReferenceImage, callImageGenerationAPI, downloadAndSaveImage, convertSvgFileToPng, DEFAULT_REF_IMAGE_PATH };
