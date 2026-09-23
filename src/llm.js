// LLM 调用层：端点规范化 + 路书生成主流程（含自动配图与兜底）
const { STYLE_DEFINITIONS } = require('./styles');
const { formatFetchError } = require('./utils');
const { getDestinationImages, injectDestinationImages } = require('./imageLibrary');
const { generateRoadbookImages } = require('./roadbookImages');

// Normalize endpoint for various LLM providers (including Google Gemini OpenAI endpoint)
function normalizeEndpoint(baseUrl) {
  let url = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) return 'https://api.deepseek.com/chat/completions';
  if (url.endsWith('/chat/completions')) return url;

  // Google Gemini OpenAI endpoint
  if (url.includes('generativelanguage.googleapis.com')) {
    if (!url.includes('/openai')) url += '/openai';
    return `${url}/chat/completions`;
  }

  // DeepSeek
  if (url.includes('api.deepseek.com')) {
    return `${url}/chat/completions`;
  }

  // Moonshot / Kimi
  if (url.includes('moonshot.cn')) {
    if (!url.endsWith('/v1')) url += '/v1';
    return `${url}/chat/completions`;
  }

  // Generic OpenAI-compatible
  if (!url.endsWith('/v1') && !url.includes('/v1/')) {
    url += '/v1';
  }
  return `${url}/chat/completions`;
}

// LLM API Caller
async function callLLM(llmConfig, params) {
  const { apiKey, baseUrl, model, clientHeader } = llmConfig;
  const {
    origin = '长沙',
    destination = '泉州',
    days = 10,
    adults = 2,
    seniors = 2,
    children = 1,
    vehicle = '燃油SUV',
    preference = '慢游舒适、防高反、适老宜幼',
    season = '中秋国庆',
    imageStyle = 'journal_doodle',
    customStylePrompt = '',
    autoImageGen = true,
    imageConfig = null
  } = params;

  const totalPeople = Number(adults) + Number(seniors) + Number(children);
  const styleInfo = STYLE_DEFINITIONS[imageStyle] || STYLE_DEFINITIONS.journal_doodle;

  const systemPrompt = `你是一位享誉业界的顶级自驾旅行规划专家兼专业路书作家。你的任务是为自驾游家庭撰写一份结构极高、文笔优美如地理杂志、数据严密、排版考究的【自驾深度全景路书】。

品牌理念：必须体现 Slogan "Plan your trip, enjoy on road!"。
视觉美学：全书配套【${styleInfo.name}】插画体系，图文细节必须展现治愈温馨的家庭自驾慢游风貌。

【核心内容与排版标准规范】：
1. 题头大标题：必须包含起点、终点、天数、家庭结构和季节。
2. 题头引用框：包含一句话总结、核心自驾决策指标表格（包含：行程时间、出行人员、自驾车型与能耗考量、预估总里程、家庭总预算与人均）。
3. 01 行前决策与交通方案：
   - 1.1 路线核心设计哲学（拒绝急行军、平缓舒适、老少适宜景点断舍离、错峰保障）；
   - 1.2 车辆整备与安全检查（根据${vehicle}车型的特性给出精准建议，如纯电充电补能/燃油长途加油/胎压制动/随车应急工具）；
   - 1.3 适老宜幼生理适应与长途关怀（防晕车技巧、急救药箱、防疲劳作息）。
4. 02 每日详细行程安排 (Day 1 至 Day ${days})：
   【绝对严禁偷懒与缩写】：必须从 Day 1 到 Day ${days} 每天完整列出，严禁出现“Day 4~6 自由活动”、“略”或“同上”！
   每天必须严格按照以下四段式时间轴与参数卡片呈现：
   ### Day X：[出发地] → [目的地]（[当日核心主题]）
   > 🚗 **单日路况参数**：单日里程约 XXkm ｜ 驾驶时长约 X.X小时 ｜ 途径路网：Gxx高速 ｜ 住宿地点：**XXXX**（带地暖/电梯舒适房型说明）
   - **08:30 - 09:30**：【晨间启程】早餐与车况检查...
   - **12:00 - 13:30**：【午餐小憩】特色餐馆与风味、副驾轮换...
   - **14:00 - 17:30**：【核心游览】平缓木栈道或全景观光车慢游、长辈观景休息区、孩子互动打卡...
   - **18:30 - 20:30**：【特色晚宴】当地具体招牌菜品、入住酒店泡脚休整...
   💡 **适老宜幼贴心提示 (Family Tips)**：栈道平缓度、无障碍设施、卫生间与热水补给点、穿衣保暖。
5. 03 住宿全攻略与预订逻辑：
   - 针对当前 ${totalPeople} 口之家的房型配置矩阵（家庭套房/双床房划分）；
   - 适老宜幼选房 4 大硬指标（电梯、空调/采暖、防滑、免拖行李走石板路）；
   - 预订黄金法则与退改保障。
6. 04 餐饮全攻略与全家团圆宴：
   - 当地必吃榜（列出 3-4 道针对 ${destination} 具体的道地名菜并说明适老清淡做法）；
   - 长辈儿童肠胃安全与养生汤锅指南；
   - 随车零食干粮与保温壶补给箱清单。
7. 05 门票优惠与家庭费用总预算表：
   - 必须包含两张详细表格：
     1. 景区门票与家庭减免明细表（基于 ${adults}成人 + ${seniors}位长辈半价/免票 + ${children}位儿童优惠 精确计算单价与小计）；
     2. 全程费用综合统计表（燃油/充电费、过路费、住宿费、餐饮费、门票景交费、应急机动金、合计总预算与人均预算）。
8. 06 预订时间线与行前装备复查清单：
   - 使用 Markdown 复选框 [ ]，包含证件、医药、保暖防晒、数码与随车好物。
9. 07 常见问答与应急救援指南：身体不适处置、堵车恶劣天气、全家自驾心态指引。
10. 结尾：以 "> 🚗 **Plan your trip, enjoy on road! 祝全家旅途平安愉快！**" 结束。

输出纯正 Markdown 格式，不要用 \`\`\`markdown 代码块包裹全文。`;

  const userPrompt = `请为我们定制一份从【${origin}】自驾出发至【${destination}】的【${days}天】高品质家庭自驾慢游路书。
基本参数如下：
- 出发地：${origin}
- 目的地：${destination}
- 计划天数：${days} 天
- 出行家庭成员：共 ${totalPeople} 人（${adults} 位成人，${seniors} 位 60岁以上老人享受门票半价/免票优惠，${children} 位儿童免票/优惠）
- 交通工具：${vehicle}
- 出行季节/时段：${season}
- 视觉风格：${styleInfo.name}
- 核心诉求：${preference}，单日车程绝不过劳，景点筛选平缓木栈道与观光车，坚决杜绝高强度登山，给老人和小孩最好的自驾慢游体验。

请立刻开始生成完整详尽的 Markdown 路书。`;

  const endpoint = normalizeEndpoint(baseUrl);
  const targetModel = model.trim() || 'gemini-3.1-pro-preview';

  console.log(`[LLM] Calling model ${targetModel} for ${origin} -> ${destination} (${days} days) in style [${styleInfo.name}]...`);
  console.log(`[LLM] Calling ${endpoint} with model ${targetModel}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'X-Mtcc-Client': clientHeader || 'roadtrip-planner'
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: 16384
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(formatFetchError(err, endpoint));
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API 响应错误 (${response.status}): ${errText}`);
  }

  const json = await response.json();
  if (json.choices && json.choices[0] && json.choices[0].message) {
    let result = json.choices[0].message.content.trim();
    // Strip markdown codeblock wrapper if LLM wrapped whole response
    result = result.replace(/^```markdown\s*\n/, '').replace(/\n```\s*$/, '');

    // Prepare destination image set according to style & autoImageGen toggle
    let finalImgSet = null;
    const activeImageConfig = imageConfig || {
      imageModel: model || 'gemini-3.8-flash',
      apiKey: apiKey,
      baseUrl: baseUrl,
      size: '1792x1024'
    };
    if (!activeImageConfig.apiKey) activeImageConfig.apiKey = apiKey;
    if (!activeImageConfig.baseUrl) activeImageConfig.baseUrl = baseUrl;

    if (autoImageGen !== false) {
      try {
        console.log(`[LLM] Auto-generating 4 styled images tailored to ${origin} -> ${destination} (${days} days)...`);
        const generatedImgs = await generateRoadbookImages({
          origin,
          destination,
          days,
          imageStyle,
          customStylePrompt,
          imageConfig: activeImageConfig,
          apiKey: activeImageConfig.apiKey || apiKey,
          baseUrl: activeImageConfig.baseUrl || baseUrl,
          roadbookContent: result
        });
        if (generatedImgs && generatedImgs.routeMap) {
          finalImgSet = generatedImgs;
        }
      } catch (genErr) {
        console.error('[Auto Image Gen Error] Fallback to matched images:', genErr.message);
      }
    }

    if (!finalImgSet || !finalImgSet.routeMap) {
      finalImgSet = getDestinationImages(origin, destination, imageStyle);
    }

    // Deterministically inject images!
    result = injectDestinationImages(result, finalImgSet);

    const titleMatch = result.match(/^#\s+([^\n]+)/);
    const title = titleMatch ? titleMatch[1] : `${origin}→${destination}${days}天自驾路书`;
    return { title, content: result, imgSet: finalImgSet, imageStyle };
  } else {
    throw new Error('LLM 返回数据格式不符合预期');
  }
}

module.exports = { normalizeEndpoint, callLLM };
