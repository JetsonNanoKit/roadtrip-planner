// 路书配图编排：从生成的路书正文中提取真实途经点/景点/美食，驱动 AI 生图（失败时降级为动态 SVG）
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { STYLE_DEFINITIONS, DEFAULT_NEGATIVE_PROMPT } = require('./styles');
const { callImageGenerationAPI, downloadAndSaveImage, convertSvgFileToPng } = require('./imageGen');
const { generateDynamicRoadbookSVG } = require('./svgGenerator');
const { isNanoBananaModel, isGptImageModel } = require('./nanoBanana');

// 从路书正文中提取「路线总览表」（如 "### 2.1 13天路线总览表" 下的 markdown 表格），
// 原样返回表格文本供生图模型逐日绘制——这是站点完整性最重要的信息源。
// 注意：「## 二、路线总览」这类章节标题下可能还嵌套子标题，需逐个头衔试探找真表格。
function extractOverviewTable(markdown) {
  if (!markdown) return '';
  const headingRe = /^#{2,4}[^\n]*总览[^\n]*$/gm;
  let headingMatch;
  while ((headingMatch = headingRe.exec(markdown)) !== null) {
    const after = markdown.slice(headingMatch.index + headingMatch[0].length);
    const tableLines = [];
    for (const line of after.split('\n')) {
      const t = line.trim();
      if (t.startsWith('|')) {
        tableLines.push(t);
      } else if (tableLines.length > 0) {
        break; // 表格结束
      } else if (!t) {
        continue; // 跳过空行
      } else if (t.startsWith('#')) {
        if (tableLines.length === 0) continue; // 子标题，继续往下找表
        break;
      } else {
        continue; // 说明文字，跳过
      }
    }
    const table = tableLines.join('\n');
    if (table.length > 100) {
      return table.length > 3000 ? table.slice(0, 3000) : table;
    }
  }
  return '';
}

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

// 与 imageGen.js 保持一致的扩散模型判定（扩散模型不支持长提示词；Nano Banana 用风格化短提示词）
function isDiffusionModel(imageModel) {
  const m = (imageModel || '').toLowerCase();
  return m.includes('dall-e') || m.includes('flux') || m.includes('imagen') ||
         m.includes('stable-diffusion') || m.includes('sdxl') ||
         m.includes('midjourney') || m.includes('cogview') ||
         m.includes('nano-banana');
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
  const loopHint = `【关键】这是一趟往返环形自驾：路线画成一条自然蜿蜒的闭环——形状要随意、放松、自由弯曲，像河流一样随山川地势游走，带自然的大弧度凹凸起伏，绝对不要规整的圆形或椭圆形；从${origin}出发，依次经过各站点后，最终沿返程路段回到${origin}（返程段建议用虚线或另一种颜色与去程区分），站点在环线上按行进顺序用红色圆点标出，起点${origin}画"起/终点"标记。`;
  const fullTextPrompt = `${roadbookContent || `${origin} → ${destination} ${days} 天自驾游`}\n\n${ROUTE_MAP_INSTRUCTION}。起点：${origin}，终点：${destination}，全程 ${days} 天。${loopHint}【风格要求】严格模仿所附参考图：钢笔淡彩黑色勾线、柔和水彩晕染（禁止平涂色块）、整幅米白水彩纸底色、微缩景观全景构图、顶部手绘标题横幅、每站配景点特色小插画、站点名中文+英文双语手写标注（直接写在地图上，不要用圆角信息框）、左上角复古指北针、四周花草装饰边角；不要图例框、不要信息面板、不要现代导航 UI 风。`;
  const shortPrompt = `A hand-drawn watercolor illustrated travel route map of a ${days}-day ROUND-TRIP road trip from ${origin} to ${destination} and back. The route forms a closed loop, but drawn organically: freeform, relaxed and winding like a river following the terrain, with gentle irregular curves — absolutely NOT a regular circle or ellipse. Starting at ${origin}, winding through key stops (${routePointsStr}), and finally returning to ${origin} (return leg drawn with dashed line or a different color to distinguish it from the outbound leg), red dots at every stop in travel order. Featuring miniature landmarks: ${landmarksStr || destination + ' scenic landmarks'}. ${ROUTE_MAP_INSTRUCTION}. Delicate black ink line art with soft watercolor washes, vintage cream paper texture, decorative compass rose, cute puffy clouds, travel journal aesthetic, high detail. ${stylePrompt}`;
  // Nano Banana 等真文生图模型：中文提示词 + 关闭自动翻译 → 站点中文标注
  const overviewTable = extractOverviewTable(roadbookContent);
  const tableBlock = overviewTable
    ? `【13天路线总览表——必须严格按此表逐日绘制：表里的每一天都是地图上的一个站点/路段，一行都不能漏，站点顺序与表一致】\n${overviewTable}\n\n`
    : '';
  const chinesePrompt = `${tableBlock}${ROUTE_MAP_INSTRUCTION}：${origin} → ${destination} ${days} 天往返自驾游。${loopHint}环线依次经过：${details.keyStops.slice(0, 13).join(' → ')}，最后回到${origin}。沿途代表性景点：${details.topAttractions.slice(0, 8).join('、') || destination + '特色景点'}。画风要求：手绘水彩旅行手账地图，钢笔淡彩黑色勾线、柔和水彩晕染、米白水彩纸纹理底色、微缩景观全景式构图；顶部手绘标题横幅写「${origin}→${destination}往返${days}天自驾路书」。构图布局要疏朗协调、有呼吸感：站点沿环线均匀散开，重要站点配水彩小插画、次要站点只标名称，插画分布在路线两侧互不遮挡，元素之间留出充足空白，不要把画面挤满或堆在一侧；每个站点用中文名称大字标注（英文小字附注），左上角复古指北针，四周点缀花草装饰边角，空白处稀疏画几朵小云朵，一辆载行李的可爱小汽车行驶在环线上。不要图例框、信息面板或现代导航 UI。`;
  const mLower = (imageModel || '').toLowerCase();
  const diffusion = isDiffusionModel(imageModel);
  // Nano Banana / GPT Image 2 为真文生图模型：吃中文长提示词 + 关自动翻译 → 站点中文标注
  const useChineseShort = mLower.includes('nano-banana') || mLower.includes('gpt-image');
  const prompt = useChineseShort ? chinesePrompt : (diffusion ? shortPrompt : fullTextPrompt);

  console.log(`[RouteMap ImageGen] model=${imageModel} promptMode=${useChineseShort ? 'chinese-short' : (diffusion ? 'short' : 'full-text')} (${prompt.length} chars), route: ${routePointsStr}`);

  const timestamp = Date.now();
  const cleanDest = Buffer.from(destination || 'trip', 'utf-8').toString('hex').slice(0, 8);
  const imagesDir = path.join(PUBLIC_DIR, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  // 3. 调用生图模型（思考型模型输出不稳定，失败自动重试 1 次后再走兜底）
  // 外采网关模型（Nano Banana / GPT Image 2）的凭据在 imageConfig.imgApiKey 等字段，
  // 与 LLM 的 apiKey 无关，守卫必须按网关凭据判断，否则会被误跳过直接走 SVG 兜底
  let item = null;
  const gatewayReady = isNanoBananaModel(imageModel) || isGptImageModel(imageModel)
    ? Boolean((imageConfig && imageConfig.imgApiKey) && (imageConfig && imageConfig.imgApiSecret) && (imageConfig && imageConfig.imgToken))
    : true;
  if (imgApiKey && imageModel && gatewayReady) {
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
          clientHeaderName: (imageConfig && imageConfig.clientHeaderName) || '',
          referenceImage: (imageConfig && imageConfig.referenceImage) || null,
          imgApiKey: (imageConfig && imageConfig.imgApiKey) || '',
          imgApiSecret: (imageConfig && imageConfig.imgApiSecret) || '',
          imgToken: (imageConfig && imageConfig.imgToken) || '',
          imgResolution: (imageConfig && imageConfig.imgResolution) || '2K',
          imgAspectRatio: (imageConfig && imageConfig.imgAspectRatio) || '16:9',
          imgGatewaySubmit: (imageConfig && imageConfig.imgGatewaySubmit) || '',
          imgGatewayQuery: (imageConfig && imageConfig.imgGatewayQuery) || '',
          imgGatewayQueryDirect: (imageConfig && imageConfig.imgGatewayQueryDirect) || ''
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
