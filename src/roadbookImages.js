// 路书配图编排：从生成的路书正文中提取真实途经点/景点/美食，驱动 AI 生图（失败时降级为动态 SVG）
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { STYLE_DEFINITIONS, DEFAULT_NEGATIVE_PROMPT } = require('./styles');
const { callImageGenerationAPI, downloadAndSaveImage, convertSvgFileToPng } = require('./imageGen');
const { generateDynamicRoadbookSVG } = require('./svgGenerator');

function extractRoadbookHighlights(markdown, origin, destination) {
  const keyStops = [];
  const topAttractions = [];
  const topFoods = [];

  // 1. Extract daily route stops: e.g. "### Day 1: 深圳 -> 韶关 -> 郴州"
  const dayRegex = /(?:^|\n)###?\s*Day\s*\d+[:：\s-]+([^\n]+)/gi;
  let match;
  while ((match = dayRegex.exec(markdown)) !== null) {
    const rawLine = match[1].trim();
    const cleanRoute = rawLine.replace(/（[^）]*）|\([^)]*\)/g, '').split(/[：:]/)[0].trim();
    if (cleanRoute && cleanRoute.length < 60) {
      keyStops.push(cleanRoute);
    }
  }

  // 2. Extract scenic spots (find bullet points under itinerary or lines with 景点/亮点/游览)
  const spotRegex = /(?:游览|打卡|核心景点|推荐景点|自然奇观|人文名胜)[:：]\s*([^\n]+)/gi;
  while ((match = spotRegex.exec(markdown)) !== null) {
    const spots = match[1].split(/[,，、]/).map(s => s.trim().replace(/[*_#]/g, '')).filter(Boolean);
    topAttractions.push(...spots);
  }

  // Also extract action mentions like "游览中山陵" or "漫步玄武湖" or "参观滕王阁"
  const actionRegex = /(?:游览|漫步|打卡|前往|参观|登临|穿行)([^，,。；;\n]{2,10}?(?:山|湖|寺|阁|陵|庙|宫|堡|桥|湾|塔|街|城|园|镇|村|景区|带))/g;
  let actMatch;
  while ((actMatch = actionRegex.exec(markdown)) !== null) {
    const spot = actMatch[1].trim().replace(/[*_#]/g, '');
    if (spot.length >= 2 && spot.length <= 12 && !topAttractions.includes(spot)) {
      topAttractions.push(spot);
    }
  }

  // Also extract landmark keywords from markdown bold tags (filtering out hotels/inns)
  const boldRegex = /\*\*([^*\n]{2,12})\*\*/g;
  while ((match = boldRegex.exec(markdown)) !== null) {
    const word = match[1].trim();
    const isAccommodation = word.includes('酒店') || word.includes('营地') || word.includes('民宿') || word.includes('客栈') || word.includes('山庄') || word.includes('宾馆');
    if (!isAccommodation) {
      if (word.includes('湖') || word.includes('山') || word.includes('寺') || word.includes('塔') || 
          word.includes('古城') || word.includes('古镇') || word.includes('村') || word.includes('峡谷') || 
          word.includes('草原') || word.includes('大桥') || word.includes('公路') || word.includes('湾') || word.includes('景区') || word.includes('洲') || word.includes('陵') || word.includes('庙') || word.includes('阁')) {
        if (!topAttractions.includes(word)) topAttractions.push(word);
      }
    }
    if (word.includes('肉') || word.includes('面') || word.includes('鸡') || word.includes('鸭') || 
        word.includes('鱼') || word.includes('火锅') || word.includes('糕') || word.includes('饼') || 
        word.includes('串') || word.includes('汤') || word.includes('包') || word.includes('饭') || word.includes('烤') || word.includes('菜') || word.includes('粉')) {
      if (!topFoods.includes(word)) topFoods.push(word);
    }
  }

  // 3. Extract food items under ## 04 餐饮全攻略
  const foodSection = markdown.match(/(?:##\s*0[34][^\n]*\n|##\s*[^#\n]*(?:餐饮|风味|美食|舌尖)[^#\n]*\n)([\s\S]*?)(?=\n##|$)/i);
  if (foodSection) {
    const foodLines = foodSection[1].split('\n');
    for (const line of foodLines) {
      const itemMatch = line.match(/(?:^\s*[\d\.\-\*]+\s*(?:【|\*\*)?([^：:\(\（\n\*\】]{2,10})(?:】|\*\*)?[:：])/);
      if (itemMatch) {
        const dish = itemMatch[1].trim().replace(/[*_#]/g, '');
        if (dish.length >= 2 && dish.length <= 10 && !dish.includes('长辈') && !dish.includes('儿童') && !dish.includes('指南') && !dish.includes('清单') && !dish.includes('攻略') && !dish.includes('贴士')) {
          if (!topFoods.includes(dish)) topFoods.push(dish);
        }
      }
      const lineFoods = line.match(/(?:特色|必吃|招牌|推荐|美食)[:：]?\s*([^\n]+)/);
      if (lineFoods) {
        const items = lineFoods[1].split(/[,，、]/).map(s => s.trim().replace(/[*_#]/g, '')).filter(s => s.length >= 2 && s.length <= 10);
        for (const item of items) {
          if (!topFoods.includes(item)) topFoods.push(item);
        }
      }
    }
  }

  return {
    keyStops: keyStops.length > 0 ? keyStops : [`${origin} -> ${destination}`],
    topAttractions: topAttractions.slice(0, 8),
    topFoods: topFoods.slice(0, 8)
  };
}
// 用户指定的开头插图绘图指令
const ROUTE_MAP_INSTRUCTION = '结合这个行程安排，和每个景点特色，绘制一张出游路线手绘地图';

// 与 imageGen.js 保持一致的扩散模型判定（扩散模型不支持长提示词）
function isDiffusionModel(imageModel) {
  const m = (imageModel || '').toLowerCase();
  return m.includes('dall-e') || m.includes('flux') || m.includes('imagen') ||
         m.includes('stable-diffusion') || m.includes('sdxl') ||
         m.includes('midjourney') || m.includes('cogview');
}

// 把 ./images/xx.svg 光栅化为 PNG（2x 清晰度）并删除中间 SVG；
// 转换失败则保留 SVG 兜底，保证插图位永远有图。
async function rasterizeToPng(savedUrl) {
  if (!savedUrl || !savedUrl.endsWith('.svg')) return savedUrl;
  try {
    const absSvg = path.join(PUBLIC_DIR, savedUrl.replace(/^\.\//, ''));
    const pngAbs = await convertSvgFileToPng(absSvg);
    try { fs.unlinkSync(absSvg); } catch (e) {}
    return `./images/${path.basename(pngAbs)}`;
  } catch (err) {
    console.warn('[RouteMap ImageGen] SVG→PNG 转换失败，保留 SVG:', err.message);
    return savedUrl;
  }
}

// 生成路书开头的「出游路线手绘地图」单图。
// 多模态 chat LLM / Vertex 路径：发送路书全文 + 绘图指令（用户要求）；
// 扩散模型（DALL·E / FLUX 等）：提示词必须精简，改用从正文提取的行程要点；
// 任何失败都降级为程序化 SVG 兜底，保证插图位永远有图。
async function generateRouteMapImage({ origin, destination, days, imageStyle, customStylePrompt, imageConfig, apiKey, baseUrl, roadbookContent }) {
  const styleInfo = STYLE_DEFINITIONS[imageStyle] || STYLE_DEFINITIONS.journal_doodle;
  const stylePrompt = [styleInfo.promptModifier, customStylePrompt || ''].filter(Boolean).join(', ');
  const imageModel = (imageConfig && imageConfig.imageModel) || 'gemini-3.8-flash';
  const imgBaseUrl = (imageConfig && imageConfig.baseUrl) || baseUrl;
  const imgApiKey = (imageConfig && imageConfig.apiKey) || apiKey;
  const imgSize = (imageConfig && imageConfig.size) || '1792x1024';
  const negativePrompt = (imageConfig && imageConfig.negativePrompt) || styleInfo.negativePrompt || DEFAULT_NEGATIVE_PROMPT;
  const clientHeader = (imageConfig && imageConfig.clientHeader) || 'roadtrip-planner';

  // 1. 从路书正文提取行程亮点（用于扩散模型的精简提示词与 SVG 兜底）
  const details = extractRoadbookHighlights(roadbookContent || '', origin, destination);
  const routePointsStr = details.keyStops.slice(0, 6).join(' ➔ ');
  const landmarksStr = details.topAttractions.slice(0, 5).join(', ');

  // 2. 按模型类型构造提示词
  const fullTextPrompt = `${roadbookContent || `${origin} → ${destination} ${days} 天自驾游`}\n\n${ROUTE_MAP_INSTRUCTION}。起点：${origin}，终点：${destination}，全程 ${days} 天。【风格要求】严格模仿所附参考图：钢笔淡彩黑色勾线、柔和水彩晕染（禁止平涂色块）、整幅米白水彩纸底色、微缩景观全景构图、顶部手绘标题横幅、深色公路线串联所有站点且每站画红色圆点、每站配景点特色小插画、站点名中文+英文双语手写标注（直接写在地图上，不要用圆角信息框）、左上角复古指北针、四周花草装饰边角；不要图例框、不要信息面板、不要现代导航 UI 风。`;
  const shortPrompt = `A hand-drawn watercolor illustrated travel route map of a ${days}-day road trip from ${origin} to ${destination}. A winding scenic highway connects key stops: ${routePointsStr}. Featuring miniature landmarks: ${landmarksStr || destination + ' scenic landmarks'}. ${ROUTE_MAP_INSTRUCTION}. Delicate black ink line art with soft watercolor washes, vintage cream paper texture, decorative compass rose, cute puffy clouds, travel journal aesthetic, high detail. ${stylePrompt}`;
  const diffusion = isDiffusionModel(imageModel);
  const prompt = diffusion ? shortPrompt : fullTextPrompt;

  console.log(`[RouteMap ImageGen] model=${imageModel} promptMode=${diffusion ? 'short' : 'full-text'} (${prompt.length} chars), route: ${routePointsStr}`);

  const timestamp = Date.now();
  const cleanDest = Buffer.from(destination || 'trip', 'utf-8').toString('hex').slice(0, 8);
  const imagesDir = path.join(PUBLIC_DIR, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  // 3. 调用生图模型（思考型模型输出不稳定，失败自动重试 1 次后再走兜底）
  let item = null;
  if (imgApiKey && imageModel) {
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !item; attempt++) {
      try {
        if (attempt > 1) console.log(`[RouteMap ImageGen] Retry attempt ${attempt}/${MAX_ATTEMPTS}...`);
        const imgUrl = await callImageGenerationAPI({
          prompt,
          imageModel,
          apiKey: imgApiKey,
          baseUrl: imgBaseUrl,
          size: imgSize,
          negativePrompt,
          clientHeader,
          referenceImage: (imageConfig && imageConfig.referenceImage) || null
        });
        const savedPath = await downloadAndSaveImage(imgUrl, `ai_${cleanDest}_routeMap_${timestamp}_a${attempt}.png`);
        const finalUrl = await rasterizeToPng(savedPath);
        item = {
          url: finalUrl,
          alt: `${origin}至${destination}出游路线手绘地图`,
          desc: `结合全文行程与每个景点特色绘制（途经：${routePointsStr}）`,
          prompt
        };
      } catch (err) {
        console.warn(`[RouteMap ImageGen Model Fail attempt ${attempt}/${MAX_ATTEMPTS}]`, err.message);
      }
    }
  }

  // 4. 兜底：程序化动态 SVG（内容取自行程文本，版式与水彩风一致）
  if (!item) {
    const svgContent = generateDynamicRoadbookSVG({
      type: 'routeMap',
      origin,
      destination,
      days,
      routeStops: details.keyStops,
      attractions: details.topAttractions,
      foods: details.topFoods,
      imageStyle
    });
    const svgFilename = `dyn_${cleanDest}_routeMap_${timestamp}.svg`;
    fs.writeFileSync(path.join(imagesDir, svgFilename), svgContent, 'utf-8');
    const finalUrl = await rasterizeToPng(`./images/${svgFilename}`);
    item = {
      url: finalUrl,
      alt: `${origin}至${destination}出游路线手绘地图`,
      desc: `根据${days}天行程动态绘制的水彩自驾路线手账（途经：${routePointsStr}）`,
      prompt
    };
  }

  return { routeMap: item };
}

module.exports = { extractRoadbookHighlights, generateRouteMapImage, ROUTE_MAP_INSTRUCTION };
