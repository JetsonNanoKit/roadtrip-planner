// 内置插画图库：按目的地匹配预置素材，并把图片确定性注入 Markdown 路书
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { generateDynamicRoadbookSVG } = require('./svgGenerator');

// Destination Image Matcher with authentic illustrations & curated scenery
function getDestinationImages(origin, destination, imageStyle = 'journal_doodle') {
  const dest = (destination || '').toLowerCase();
  const isJournalOrGhibli = (imageStyle === 'journal_doodle' || imageStyle === 'ghibli_anime');

  // 1. Quanzhou / Fujian / Minnan
  if (dest.includes('泉州') || dest.includes('厦门') || dest.includes('福建') || dest.includes('武夷山') || dest.includes('潮汕')) {
    return {
      name: '泉州',
      routeMap: {
        alt: `${origin}至泉州自驾手绘路线全览图`,
        url: isJournalOrGhibli ? './images/cartoon_quanzhou_map.png' : './images/quanzhou_route_map.png',
        desc: '展示从长沙向东跨越江西、武夷山，进入海丝起点泉州开元寺双塔、蟳埔村簪花围的手绘路线图'
      },
      scenery1: {
        alt: '泉州西街与开元寺东西石塔全景',
        url: isJournalOrGhibli ? './images/cartoon_quanzhou_weststreet.png' : './images/quanzhou_scenery_1.png',
        desc: '泉州西街闽南红砖古厝与开元寺双塔，适老平缓石板路漫步'
      },
      scenery2: {
        alt: '泉州蟳埔渔村蚵壳厝与簪花围海风',
        url: isJournalOrGhibli ? './images/cartoon_quanzhou_xunpu.png' : './images/quanzhou_scenery_2.png',
        desc: '蟳埔村非遗簪花围、蚵壳厝古民居与洛阳桥古石桥'
      },
      food: {
        alt: '泉州特色砂锅姜母鸭与面线糊美食宴',
        url: isJournalOrGhibli ? './images/cartoon_quanzhou_food.png' : './images/quanzhou_food.png',
        desc: '热气腾腾的泉州砂锅姜母鸭、面线糊配油条、海蛎煎与闽南烧肉粽'
      }
    };
  }

  // 2. Yunnan / Dali / Lijiang / Kunming
  if (dest.includes('云南') || dest.includes('大理') || dest.includes('丽江') || dest.includes('昆明') || dest.includes('洱海') || dest.includes('香格里拉') || dest.includes('西双版纳')) {
    return {
      name: '云南',
      routeMap: {
        alt: `${origin}至云南自驾路线手绘全览图`,
        url: isJournalOrGhibli ? './images/cartoon_yunnan_map.png' : './images/yunnan_route_map.png',
        desc: '展示从长沙沿沪昆高速、杭瑞高速进入云南，串联昆明、大理洱海、丽江古城的手绘路线图'
      },
      scenery1: {
        alt: '大理洱海生态廊道与苍山风光',
        url: isJournalOrGhibli ? './images/cartoon_yunnan_dali.png' : './images/yunnan_scenery_1.png',
        desc: '大理洱海湖畔生态廊道慢行自驾，湖光倒映苍山白云'
      },
      scenery2: {
        alt: '丽江古城石板街与玉龙雪山远眺',
        url: isJournalOrGhibli ? './images/cartoon_yunnan_lijiang.png' : './images/yunnan_scenery_2.png',
        desc: '丽江古朴木楼水渠，远处是圣洁的玉龙雪山，适老平缓慢游'
      },
      food: {
        alt: '云南特色野生菌铜锅火锅与过桥米线',
        url: './images/yunnan_food.png',
        desc: '热气腾腾的云南野生菌铜锅土鸡汤、过桥米线、鲜花饼与全家团圆宴'
      }
    };
  }

  // 3. Chuanxi / Western Sichuan / Daocheng / Siguniang
  if (dest.includes('川西') || dest.includes('四姑娘山') || dest.includes('新都桥') || dest.includes('丹巴') || dest.includes('稻城') || dest.includes('康定') || dest.includes('阿坝') || dest.includes('甘孜') || dest.includes('九寨沟') || dest.includes('成都')) {
    return {
      name: '川西',
      routeMap: {
        alt: `${origin}至川西高原自驾路线手绘水彩全览图`,
        url: isJournalOrGhibli ? './images/style_reference_watercolor_map.jpg' : './images/chuanxi_route_map_1790058660321.png',
        desc: '川西小环线13天自驾路书手绘水彩全景地图（途经：成都、都江堰、青城山、四姑娘山、丹巴甲居藏寨、墨石公园、塔公草原、新都桥、折多山4298m、泸定桥、雅安）',
        referenceImage: './images/style_reference_watercolor_map.jpg'
      },
      scenery1: {
        alt: '四姑娘山双桥沟雪山草甸与溪流',
        url: './images/siguniang_valley_1790058703265.png',
        desc: '双桥沟雪峰耸立，栈道平缓适老宜幼，全景观光车巡游'
      },
      scenery2: {
        alt: '丹巴甲居藏寨嘉绒风情田园古村',
        url: './images/danba_village_1790058741195.png',
        desc: '中国最美乡村丹巴藏寨，梨树掩映下的红白藏楼，低海拔吸氧休整'
      },
      food: {
        alt: '川西高原牦牛肉汤锅与全家团圆宴',
        url: './images/chuanxi_food_1790058776106.png',
        desc: '铜锅热气腾腾的松茸炖牦牛肉汤、青稞饼、酥油茶与川味家常菜'
      }
    };
  }

  // 4. Xinjiang
  if (dest.includes('新疆') || dest.includes('伊犁') || dest.includes('独库') || dest.includes('喀纳斯') || dest.includes('赛里木湖')) {
    return {
      name: '新疆',
      routeMap: {
        alt: `${origin}至新疆独库自驾手绘路线全览图`,
        url: isJournalOrGhibli ? './images/cartoon_xinjiang_map.png' : 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80',
        desc: '天山独库公路、赛里木湖、那拉提手绘全景路线图'
      },
      scenery1: {
        alt: '赛里木湖大西洋最后一滴眼泪蔚蓝风光',
        url: isJournalOrGhibli ? './images/cartoon_xinjiang_sayram.png' : 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        desc: '赛里木湖蔚蓝湖面、白天鹅与雪山草甸毡房慢游'
      },
      scenery2: {
        alt: '喀纳斯禾木村白桦林与木屋晨雾',
        url: isJournalOrGhibli ? './images/cartoon_xinjiang_hemu.png' : 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        desc: '禾木图瓦人小木屋与金黄白桦林晨雾'
      },
      food: {
        alt: '新疆大盘鸡烤包子手抓羊肉盛宴',
        url: isJournalOrGhibli ? './images/cartoon_xinjiang_food.png' : 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
        desc: '新疆大盘鸡配皮带面、烤包子、羊肉串与手抓饭'
      }
    };
  }

  // 5. Xi'an / Shaanxi
  if (dest.includes('西安') || dest.includes('陕西') || dest.includes('兵马俑') || dest.includes('华山')) {
    return {
      name: '西安',
      routeMap: {
        alt: `${origin}至西安古都自驾手绘路线全览图`,
        url: isJournalOrGhibli ? './images/cartoon_xian_map.png' : 'https://images.unsplash.com/photo-1590559899731-a382839e5549?auto=format&fit=crop&w=1200&q=80',
        desc: '串联西安古城墙、钟鼓楼、大雁塔与兵马俑的手绘路线图'
      },
      scenery1: {
        alt: '西安古城墙与灯火璀璨钟楼夜景',
        url: isJournalOrGhibli ? './images/cartoon_xian_citywall.png' : 'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=1200&q=80',
        desc: '古城墙骑行漫步与夜幕下金碧辉煌的钟楼'
      },
      scenery2: {
        alt: '世界第八大奇迹秦始皇兵马俑与大雁塔',
        url: isJournalOrGhibli ? './images/cartoon_xian_terracotta.png' : 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1200&q=80',
        desc: '生动的兵马俑阵列与唐风大雁塔人文巡礼'
      },
      food: {
        alt: '西安地道风味羊肉泡馍与肉夹馍美食宴',
        url: isJournalOrGhibli ? './images/cartoon_xian_food.png' : 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80',
        desc: '热气腾腾的羊肉泡馍、酥脆肉夹馍、油泼biangbiang面与酸梅汤'
      }
    };
  }

  // 5. Hainan
  if (dest.includes('海南') || dest.includes('三亚') || dest.includes('海口') || dest.includes('万宁') || dest.includes('陵水')) {
    return {
      name: '海南',
      routeMap: {
        alt: `${origin}至海南环岛自驾全览图`,
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        desc: '海南热带滨海环岛旅游公路'
      },
      scenery1: {
        alt: '三亚亚龙湾清澈碧海与细软沙滩',
        url: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1200&q=80',
        desc: '平缓沙滩适老宜幼踩水'
      },
      scenery2: {
        alt: '万宁石梅湾沿海公路与椰林绿道',
        url: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=1200&q=80',
        desc: '椰风海韵慢速巡航'
      },
      food: {
        alt: '海南地道文昌鸡与糟粕醋海鲜火锅',
        url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80',
        desc: '鲜美原汁原味的椰子鸡与时令海鲜'
      }
    };
  }

  // Dynamically generate high-definition vector illustrations for ANY destination
  const imagesDir = path.join(PUBLIC_DIR, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const cleanDest = Buffer.from(destination || 'trip', 'utf-8').toString('hex').slice(0, 8);
  const timestamp = Date.now();

  const keys = ['routeMap', 'scenery1', 'scenery2', 'food'];
  const dynSet = { name: destination };

  for (const key of keys) {
    const filename = `dyn_${cleanDest}_${key}_${timestamp}.svg`;
    const svgPath = path.join(imagesDir, filename);
    const svgContent = generateDynamicRoadbookSVG({
      type: key,
      origin,
      destination,
      days: 7,
      routeStops: [origin, `${destination}沿途名胜`, destination],
      attractions: [`${destination}核心自然奇观`, `${destination}特色人文名胜`],
      foods: [`${destination}招牌特色名菜`],
      imageStyle
    });
    fs.writeFileSync(svgPath, svgContent, 'utf-8');
    dynSet[key] = {
      alt: `${origin}至${destination}${key === 'routeMap' ? '自驾路线规划手账地图' : key === 'scenery1' ? '核心自然景观' : key === 'scenery2' ? '特色人文慢游' : '地道风味美食品鉴'}`,
      url: `./images/${filename}`,
      desc: `${destination}${key === 'routeMap' ? '自驾慢游手绘路线图' : key === 'scenery1' ? '核心山水胜境' : key === 'scenery2' ? '特色人文风貌' : '招牌风味特色宴'}`
    };
  }
  return dynSet;
}

// Injects destination-matched images accurately into LLM markdown, replacing any hallucinated or mismatched images
function injectDestinationImages(markdown, imgSet) {
  let doc = markdown;

  // 1. Remove all existing markdown images to prevent legacy or mismatched duplicates
  doc = doc.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
  doc = doc.replace(/\n{3,}/g, '\n\n');

  // 2. Build the guaranteed 4-card Visual Showcase Banner
  const visualBanner = [
    `\n\n## 00 视觉手账画报与全景展示`,
    `![${imgSet.routeMap.alt}](${imgSet.routeMap.url})`,
    `*🚗 自驾路线规划全景手绘图（${imgSet.routeMap.desc}）*\n`,
    `![${imgSet.scenery1.alt}](${imgSet.scenery1.url})`,
    `*🏔️ 核心自然标志景观手账（${imgSet.scenery1.desc}）*\n`,
    `![${imgSet.scenery2.alt}](${imgSet.scenery2.url})`,
    `*🏮 特色历史人文慢游手账（${imgSet.scenery2.desc}）*\n`,
    `![${imgSet.food.alt}](${imgSet.food.url})`,
    `*🍲 地方非遗风味美食品鉴手账（${imgSet.food.desc}）*\n\n`
  ].join('\n');

  // Insert right after the top quote block (or after H1)
  const quoteMatch = doc.match(/(#\s+[^\n]+\n+(?:>[\s\S]*?\n+)+)/);
  if (quoteMatch) {
    doc = doc.replace(quoteMatch[0], `${quoteMatch[0].trimEnd()}${visualBanner}`);
  } else {
    const h1Match = doc.match(/(#\s+[^\n]+\n+)/);
    if (h1Match) {
      doc = doc.replace(h1Match[0], `${h1Match[0]}${visualBanner}`);
    } else {
      doc = `${visualBanner}${doc}`;
    }
  }

  return doc;
}

module.exports = { getDestinationImages, injectDestinationImages };
