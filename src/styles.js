// 插画风格预设与提示词定义

const DEFAULT_NEGATIVE_PROMPT = 'photorealistic, photo, 3d render, CGI, dark lighting, messy sketch, neon colors, modern GPS navigation UI, high contrast, oversaturated, blurry lines, noisy background, abstract';

const WATERCOLOR_TRIGGER_WORDS = {
  styleAndMedium: 'hand-drawn illustrated travel map, delicate black ink outlines, soft watercolor wash, pen and watercolor sketch, textured off-white paper background, whimsical cozy travel journal aesthetic',
  compositionAndPerspective: 'isometric miniature landscape view, panoramic pictorial map, winding scenic highway with arrows and road signs',
  decorationsAndDetails: 'miniature landmarks, vintage decorative compass rose in corner, botanical border doodles, cute puffy clouds, fresh earthy and pastel color palette (sage green, soft mountain blue, warm ochre, snow white), clean composition, high detail, whimsical pictorial map'
};

const STYLE_DEFINITIONS = {
  journal_doodle: {
    id: 'journal_doodle',
    name: '手绘水彩风旅行路书地图 (推荐·钢笔淡彩微缩全景)',
    badge: '推荐·手绘水彩',
    promptModifier: `${WATERCOLOR_TRIGGER_WORDS.styleAndMedium}, ${WATERCOLOR_TRIGGER_WORDS.compositionAndPerspective}, ${WATERCOLOR_TRIGGER_WORDS.decorationsAndDetails}`,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    triggerWords: WATERCOLOR_TRIGGER_WORDS,
    aspectRatio: '16:9'
  },
  vintage_watercolor: {
    id: 'vintage_watercolor',
    name: '复古水彩旅行画报风',
    badge: '典雅·地理画报',
    promptModifier: 'Vintage watercolor travel sketch style, elegant watercolor wash on aged parchment paper, delicate architectural and landscape drawings, National Geographic travel editorial illustration',
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio: '16:9'
  },
  ghibli_anime: {
    id: 'ghibli_anime',
    name: '清新唯美吉卜力绘本风',
    badge: '唯美·治愈动画',
    promptModifier: 'Studio Ghibli anime scenery style, lush greenery, sparkling waters, fluffy clouds, bright warm sunlight, nostalgic and heartwarming storybook illustration',
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio: '16:9'
  },
  modern_vector: {
    id: 'modern_vector',
    name: '极简扁平现代矢量风',
    badge: '简约·现代设计',
    promptModifier: 'Modern flat vector travel illustration, clean geometric shapes, minimalist palette, sleek infographic design',
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio: '16:9'
  },
  custom: {
    id: 'custom',
    name: '自定义风格',
    badge: '自定义',
    promptModifier: '',
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    aspectRatio: '16:9'
  }
};

module.exports = { DEFAULT_NEGATIVE_PROMPT, WATERCOLOR_TRIGGER_WORDS, STYLE_DEFINITIONS };
