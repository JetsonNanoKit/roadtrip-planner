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
  const svgSystemPrompt = `You are a master watercolor travel book illustrator and visual cartographer.
Create a complete, visually stunning standalone vector SVG illustration matching the "Hand-drawn Watercolor Travel Itinerary Map" style.

STRICT VISUAL AESTHETICS (Imitate the provided style reference image):
1. Medium & Texture: Delicate black ink outlines (pen and watercolor sketch stroke="#2B3A42"), soft watercolor wash fills, subtle off-white textured paper (#FAF7F0 or #FDFBF7), low-saturation earthy & pastel color palette (sage green #8FA89B, mountain blue #6B8E9B, warm ochre #C68B59, terracotta #D9826C, snow white #FAF8F5).
2. Composition & Perspective: Isometric miniature landscape view (微缩半鸟瞰等轴视角), winding scenic highway/path connecting landmarks with directional arrows (➔) and road shields (G318, G350).
3. Core Elements: Miniature landmarks (snow-capped mountain with white peaks, ancient stone pavilions with flying eaves, arched bridges, conifer pine trees, cute yellow SUV with roof luggage), vintage decorative 8-point compass rose in corner, botanical border doodles, cute soft puffy watercolor clouds, hand-lettered badge tags.
4. Negative Constraints: Strictly avoid photorealistic, photo, 3d render, CGI, dark lighting, messy sketch, neon colors, modern GPS navigation UI, high contrast, oversaturated.
5. Technical: Root element <svg viewBox="0 0 1200 675" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">. Fully valid XML SVG with <defs>, <linearGradient>, <filter>, <path>, <rect>, <circle>, <polygon>, <text>, <g>.
6. Output: Output ONLY the complete <svg>...</svg> code inside \`\`\`xml or \`\`\`svg codeblock. No extra explanations.
7. TOKEN BUDGET (critical): the output token limit is finite. Keep the SVG COMPACT so it never gets cut off mid-tag — use at most ~50 elements, prefer <circle>/<rect>/<polygon>/<line> over long <path> data, limit gradients and filters to the few essential ones, and keep decorative detail restrained. A complete smaller SVG is far better than a truncated elaborate one.`;

// 截断 SVG 修复：去掉末尾半个标签，用栈补全未闭合的元素，最后闭合 </svg>
function repairTruncatedSvg(text) {
  let svg = text.slice(text.indexOf('<svg'));
  // 去掉末尾未写完的半个标签（如 `<rect x="12` 或孤立的 `<`）
  svg = svg.replace(/<[^<>]*$/, '');
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

  const userContent = [
    {
      type: 'text',
      text: `You are provided with a visual style reference image ('川西小环线13天自驾路书' hand-drawn watercolor travel map).
Please carefully examine the reference image's visual style:
- Pen and black ink outlines (#2B3A42) with soft watercolor washes
- Textured cream / off-white paper tone (#FAF7F0)
- Isometric miniature panorama perspective
- Winding highway connecting key stops with directional arrows (➔) and road shields (G318, G350)
- Miniature landmarks (ancient buildings, snow-capped mountains, turquoise river, cute yellow SUV with luggage)
- Vintage 8-point decorative compass rose in corner, delicate botanical doodles
- Clean bilingual badge tags

Now, create a complete standalone vector SVG illustration that strictly imitates this reference image's visual art style, color tones, and composition for the following road trip highlight:
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
  const timeoutId = setTimeout(() => controller.abort(), 120000);

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
        max_tokens: 16384
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
      svgMatch = repaired.match(/<svg[\s\S]*<\/svg>/i);
    }
    if (svgMatch) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(svgMatch[0])}`;
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

module.exports = { getResolvedReferenceImage, callImageGenerationAPI, downloadAndSaveImage, DEFAULT_REF_IMAGE_PATH };
