// 动态矢量插画生成器：根据真实行程绘制 SVG 手账图（零外部依赖的兜底方案）

// XML escaping helper for safe SVG text embedding
function xmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Dynamic Vector Hand-Drawn Travel Journal SVG Generator
// Draws customized, high-resolution vector illustrations tailored to the EXACT itinerary, route stops, attractions, and dishes!
function generateDynamicRoadbookSVG({ type, origin = '出发地', destination = '目的地', days = 7, routeStops = [], attractions = [], foods = [], imageStyle = 'journal_doodle' }) {
  const cleanOrigin = xmlEscape(origin);
  const cleanDest = xmlEscape(destination);
  const cleanDays = xmlEscape(days);

  const stops = (routeStops && routeStops.length > 0 ? routeStops : [`${origin}`, `${destination}`]).map(xmlEscape);
  const spots = (attractions && attractions.length > 0 ? attractions : [`${destination}核心胜景`, `${destination}人文名胜`]).map(xmlEscape);
  const dishes = (foods && foods.length > 0 ? foods : [`${destination}特色招牌菜`, `${destination}地道风味`]).map(xmlEscape);

  // Common watercolor SVG defs
  const commonDefs = `
    <filter id="softShadow" x="-10%" y="-10%" width="125%" height="125%">
      <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#2B3A42" flood-opacity="0.12" />
    </filter>
    <filter id="cardShadow" x="-10%" y="-10%" width="125%" height="125%">
      <feDropShadow dx="1" dy="3" stdDeviation="2.5" flood-color="#2B3A42" flood-opacity="0.10" />
    </filter>
    <linearGradient id="skyWash" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E9F1F5" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#FAF7F0" stop-opacity="0.2" />
    </linearGradient>
    <linearGradient id="meadowWash" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E2EBE4" stop-opacity="0.85" />
      <stop offset="60%" stop-color="#FAF7F0" stop-opacity="0.1" />
    </linearGradient>
    <linearGradient id="mountainSun" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B2CBD7" />
      <stop offset="100%" stop-color="#8DAFBE" />
    </linearGradient>
    <linearGradient id="mountainShadow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6F92A3" />
      <stop offset="100%" stop-color="#557585" />
    </linearGradient>
    <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#5A6D7C" />
      <stop offset="50%" stop-color="#4A5C6A" />
      <stop offset="100%" stop-color="#3C4B57" />
    </linearGradient>
    <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A5C8D6" stop-opacity="0.7" />
      <stop offset="100%" stop-color="#7FA8B8" stop-opacity="0.85" />
    </linearGradient>
  `;

  // Corner Botanical Doodles
  const botanicalDoodles = `
    <g transform="translate(1110, 45)" stroke="#6E8B74" stroke-width="1.8" fill="none" stroke-linecap="round">
      <path d="M 0 0 C -25 15, -45 40, -50 70" />
      <path d="M -20 18 C -32 14, -38 6, -30 2 C -24 0, -16 10, -20 18 Z" fill="#8FA89B" opacity="0.8" />
      <path d="M -35 38 C -48 36, -52 26, -42 22 C -36 20, -30 30, -35 38 Z" fill="#A3C9A8" opacity="0.8" />
      <path d="M -46 58 C -60 60, -64 50, -55 44 C -48 42, -43 52, -46 58 Z" fill="#8FA89B" opacity="0.8" />
      <circle cx="-15" cy="5" r="3" fill="#D9826C" />
      <circle cx="-40" cy="18" r="2.5" fill="#C68B59" />
    </g>
    <g transform="translate(45, 600)" stroke="#6E8B74" stroke-width="1.8" fill="none" stroke-linecap="round">
      <path d="M 0 0 C 25 -15, 45 -40, 50 -70" />
      <path d="M 20 -18 C 32 -14, 38 -6, 30 -2 C 24 0, 16 -10, 20 -18 Z" fill="#8FA89B" opacity="0.8" />
      <path d="M 35 -38 C 48 -36, 52 -26, 42 -22 C 36 -20, 30 -30, 35 -38 Z" fill="#A3C9A8" opacity="0.8" />
      <circle cx="15" cy="-5" r="3" fill="#D9826C" />
    </g>
  `;

  // Vintage Decorative Compass Rose
  const compassRose = `
    <g transform="translate(85, 95)">
      <circle cx="45" cy="45" r="42" fill="#FAF7F0" stroke="#2B3A42" stroke-width="1.8" />
      <circle cx="45" cy="45" r="38" fill="none" stroke="#C68B59" stroke-width="1" stroke-dasharray="3,3" />
      <circle cx="45" cy="45" r="34" fill="none" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="45,45 45,8 39,45" fill="#2B3A42" />
      <polygon points="45,45 45,8 51,45" fill="#C68B59" />
      <polygon points="45,45 45,82 51,45" fill="#2B3A42" />
      <polygon points="45,45 45,82 39,45" fill="#FAF7F0" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="45,45 82,45 45,39" fill="#2B3A42" />
      <polygon points="45,45 82,45 45,51" fill="#FAF7F0" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="45,45 8,45 45,51" fill="#2B3A42" />
      <polygon points="45,45 8,45 45,39" fill="#FAF7F0" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="45,45 70,20 45,41" fill="#6B8E9B" />
      <polygon points="45,45 20,70 45,49" fill="#6B8E9B" />
      <polygon points="45,45 20,20 41,45" fill="#8FA89B" />
      <polygon points="45,45 70,70 49,45" fill="#8FA89B" />
      <circle cx="45" cy="45" r="5" fill="#D9826C" stroke="#2B3A42" stroke-width="1.5" />
      <circle cx="45" cy="45" r="1.5" fill="#FFFFFF" />
      <text x="45" y="3" font-size="12" font-weight="bold" fill="#2B3A42" text-anchor="middle" font-family="'Georgia', serif">N</text>
      <text x="45" y="96" font-size="9" font-weight="bold" fill="#6B8E9B" text-anchor="middle" font-family="'Georgia', serif">S</text>
      <text x="96" y="48" font-size="9" font-weight="bold" fill="#6B8E9B" text-anchor="middle" font-family="'Georgia', serif">E</text>
      <text x="-3" y="48" font-size="9" font-weight="bold" fill="#6B8E9B" text-anchor="middle" font-family="'Georgia', serif">W</text>
    </g>
  `;

  if (type === 'routeMap') {
    // 示例 1: 经典自驾/公路旅行水彩路线图
    const maxWaypoints = Math.min(stops.length, 6);
    const displayStops = stops.slice(0, maxWaypoints);
    if (!displayStops[0].includes(origin)) displayStops.unshift(cleanOrigin);
    if (!displayStops[displayStops.length - 1].includes(destination)) displayStops.push(cleanDest);

    const waypointsCount = Math.min(displayStops.length, 5);
    const waypointsSVG = displayStops.slice(0, waypointsCount).map((stop, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === waypointsCount - 1;
      const badgeText = isStart ? '起点' : isEnd ? '目的地' : `途经 D${idx + 1}`;
      const badgeColor = isStart ? '#10B981' : isEnd ? '#DC2626' : '#F59E0B';

      const posMap = [
        { cardX: 60, cardY: 465, dotX: 125, dotY: 435, up: false },
        { cardX: 280, cardY: 485, dotX: 345, dotY: 415, up: false },
        { cardX: 520, cardY: 220, dotX: 585, dotY: 375, up: true },
        { cardX: 740, cardY: 465, dotX: 805, dotY: 330, up: false },
        { cardX: 970, cardY: 270, dotX: 1040, dotY: 365, up: true }
      ];
      const pos = posMap[idx] || posMap[0];

      return `
        <!-- Waypoint ${idx + 1} -->
        <circle cx="${pos.dotX}" cy="${pos.dotY}" r="7" fill="${badgeColor}" stroke="#2B3A42" stroke-width="2.5" />
        <line x1="${pos.dotX}" y1="${pos.dotY}" x2="${pos.dotX}" y2="${pos.up ? pos.cardY + 56 : pos.cardY}" stroke="#2B3A42" stroke-width="1.8" stroke-dasharray="3,3" />
        <g transform="translate(${pos.cardX}, ${pos.cardY})">
          <rect width="135" height="56" rx="10" fill="#FFFFFF" stroke="#2B3A42" stroke-width="2" filter="url(#cardShadow)" />
          <rect x="8" y="8" width="48" height="18" rx="4" fill="${badgeColor}" />
          <text x="32" y="21" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="'PingFang SC', sans-serif">${badgeText}</text>
          <text x="68" y="42" font-size="13" font-weight="900" fill="#1E293B" text-anchor="middle" font-family="'PingFang SC', sans-serif">${stop.slice(0, 7)}</text>
        </g>
      `;
    }).join('\n');

    return `<svg viewBox="0 0 1200 675" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>${commonDefs}</defs>
  <rect width="1200" height="675" fill="#FAF7F0" />
  <ellipse cx="200" cy="560" rx="320" ry="160" fill="url(#meadowWash)" />
  <ellipse cx="1020" cy="160" rx="280" ry="150" fill="url(#skyWash)" />
  <ellipse cx="600" cy="350" rx="450" ry="220" fill="#F4EFE6" opacity="0.4" />

  <rect x="24" y="24" width="1152" height="627" rx="18" fill="none" stroke="#2B3A42" stroke-width="2.5" />
  <rect x="32" y="32" width="1136" height="611" rx="14" fill="none" stroke="#8FA89B" stroke-width="1.2" stroke-dasharray="8,6" opacity="0.75" />

  ${botanicalDoodles}
  ${compassRose}

  <!-- Header Banner matching the watercolor reference map -->
  <g transform="translate(180, 50)">
    <rect width="680" height="78" rx="16" fill="#FFFDF8" stroke="#2B3A42" stroke-width="2.5" filter="url(#cardShadow)" />
    <!-- Decorative folded ribbon corners -->
    <path d="M 0 16 Q 340 8, 680 16 L 680 0 L 0 0 Z" fill="#D9826C" opacity="0.45" />
    <text x="32" y="42" font-size="25" font-weight="900" fill="#1E293B" font-family="'PingFang SC', 'Noto Serif SC', sans-serif">
      📍 ${cleanOrigin} ➔ ${cleanDest} · ${cleanDays}天自驾水彩旅行路书
    </text>
    <text x="32" y="66" font-size="12" font-weight="bold" fill="#C68B59" font-family="'PingFang SC', sans-serif">
      HAND-DRAWN WATERCOLOR TRAVEL ITINERARY MAP ｜ 适老宜幼 · 全家慢游精编版
    </text>
    <!-- Cute prayer flag doodle on ribbon -->
    <g transform="translate(565, 20)">
      <line x1="0" y1="0" x2="85" y2="12" stroke="#2B3A42" stroke-width="1.4" />
      <polygon points="5,1 20,3 14,20" fill="#3B82F6" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="22,3 37,5 31,22" fill="#FFFFFF" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="39,5 54,7 48,24" fill="#DC2626" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="56,7 71,9 65,26" fill="#F59E0B" stroke="#2B3A42" stroke-width="0.8" />
      <polygon points="73,9 85,11 80,28" fill="#10B981" stroke="#2B3A42" stroke-width="0.8" />
    </g>
  </g>

  <!-- Puffy Watercolor Clouds -->
  <g transform="translate(870, 75)" opacity="0.85">
    <ellipse cx="40" cy="20" rx="30" ry="14" fill="#FFFFFF" filter="url(#cardShadow)" />
    <ellipse cx="25" cy="14" rx="16" ry="14" fill="#FFFFFF" />
    <ellipse cx="50" cy="15" rx="18" ry="15" fill="#FFFFFF" />
    <path d="M 10 24 C 5 18, 15 5, 26 10 C 35 2, 55 4, 60 14 C 70 12, 75 22, 68 26 C 70 30, 10 30, 10 24 Z" fill="none" stroke="#6B8E9B" stroke-width="1.2" opacity="0.6" />
  </g>

  <!-- Isometric Snow Mountain -->
  <g transform="translate(740, 150)">
    <polygon points="120,220 180,80 240,220" fill="url(#mountainShadow)" stroke="#2B3A42" stroke-width="1.5" />
    <polygon points="180,80 240,220 280,220 180,80" fill="url(#mountainSun)" stroke="#2B3A42" stroke-width="1.5" />
    <polygon points="180,80 162,122 175,118 180,128 190,116 202,125 180,80" fill="#FAF8F5" stroke="#2B3A42" stroke-width="1.2" />
    <polygon points="20,240 100,50 180,240" fill="url(#mountainShadow)" stroke="#2B3A42" stroke-width="2" />
    <polygon points="100,50 180,240 220,240 100,50" fill="url(#mountainSun)" stroke="#2B3A42" stroke-width="2" />
    <polygon points="100,50 75,110 88,102 96,118 108,100 125,115 100,50" fill="#FFFFFF" stroke="#2B3A42" stroke-width="1.5" />
    <line x1="100" y1="50" x2="100" y2="240" stroke="#2B3A42" stroke-width="1.5" stroke-dasharray="4,2" />
    <rect x="70" y="245" width="80" height="22" rx="4" fill="#FFFFFF" stroke="#2B3A42" stroke-width="1.2" />
    <text x="110" y="260" font-size="11" font-weight="bold" fill="#2B3A42" text-anchor="middle" font-family="'PingFang SC', sans-serif">🏔️ 核心胜景</text>
  </g>

  <!-- Winding River -->
  <path d="M 680 430 C 740 450, 800 420, 850 470 C 900 520, 950 500, 1080 540" fill="none" stroke="url(#riverGrad)" stroke-width="18" stroke-linecap="round" />
  <path d="M 680 430 C 740 450, 800 420, 850 470 C 900 520, 950 500, 1080 540" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="6,8" stroke-linecap="round" opacity="0.7" />

  <!-- Miniature Stone Arch Bridge -->
  <g transform="translate(820, 440) rotate(15)">
    <path d="M 0 10 Q 25 -5, 50 10 L 50 18 Q 25 3, 0 18 Z" fill="#E2E8F0" stroke="#2B3A42" stroke-width="1.8" />
    <path d="M 12 14 Q 25 5, 38 14 Z" fill="#7FA8B8" stroke="#2B3A42" stroke-width="1.2" />
    <text x="25" y="-8" font-size="10" font-weight="bold" fill="#2B3A42" text-anchor="middle" font-family="'PingFang SC', sans-serif">古石桥</text>
  </g>

  <!-- Traditional Ancient Pavilion -->
  <g transform="translate(210, 240)">
    <path d="M 10 35 Q 40 18, 70 35 L 64 35 Q 40 24, 16 35 Z" fill="#C68B59" stroke="#2B3A42" stroke-width="1.8" />
    <path d="M 20 22 Q 40 10, 60 22 L 56 22 Q 40 14, 24 22 Z" fill="#D9826C" stroke="#2B3A42" stroke-width="1.5" />
    <circle cx="40" cy="8" r="3" fill="#D9826C" stroke="#2B3A42" stroke-width="1.2" />
    <line x1="22" y1="35" x2="22" y2="58" stroke="#2B3A42" stroke-width="2" />
    <line x1="58" y1="35" x2="58" y2="58" stroke="#2B3A42" stroke-width="2" />
    <rect x="14" y="58" width="52" height="10" rx="2" fill="#E2E8F0" stroke="#2B3A42" stroke-width="1.8" />
    <circle cx="16" cy="40" r="4" fill="#DC2626" stroke="#2B3A42" stroke-width="1" />
    <rect x="5" y="72" width="70" height="20" rx="4" fill="#FFFFFF" stroke="#2B3A42" stroke-width="1.2" />
    <text x="40" y="86" font-size="10" font-weight="bold" fill="#78350F" text-anchor="middle" font-family="'PingFang SC', sans-serif">🏮 人文古建</text>
  </g>

  <!-- Sweeping S-Curve Highway -->
  <path d="M 110 440 C 260 520, 380 340, 560 380 S 840 280, 1080 370" fill="none" stroke="#2B3A42" stroke-width="20" stroke-linecap="round" opacity="0.15" />
  <path d="M 110 435 C 260 515, 380 335, 560 375 S 840 275, 1080 365" fill="none" stroke="url(#roadGrad)" stroke-width="14" stroke-linecap="round" />
  <path d="M 110 435 C 260 515, 380 335, 560 375 S 840 275, 1080 365" fill="none" stroke="#FAF7F0" stroke-width="2" stroke-dasharray="10,12" stroke-linecap="round" />

  <!-- Directional Arrows -->
  <g fill="#FBBF24" stroke="#2B3A42" stroke-width="1.2">
    <polygon points="260,455 272,462 260,469 264,462" transform="rotate(-15, 264, 462)" />
    <polygon points="450,345 462,352 450,359 454,352" transform="rotate(12, 454, 352)" />
    <polygon points="730,310 742,317 730,324 734,317" transform="rotate(-18, 734, 317)" />
    <polygon points="940,305 952,312 940,319 944,312" transform="rotate(22, 944, 312)" />
  </g>

  <!-- National Highway Route Shields matching Reference Map -->
  <g transform="translate(365, 395) rotate(-10)">
    <rect width="44" height="24" rx="6" fill="#DC2626" stroke="#FFFFFF" stroke-width="2" filter="url(#cardShadow)" />
    <text x="22" y="16" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif">G318</text>
  </g>
  <g transform="translate(850, 275) rotate(15)">
    <rect width="44" height="24" rx="6" fill="#DC2626" stroke="#FFFFFF" stroke-width="2" filter="url(#cardShadow)" />
    <text x="22" y="16" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif">G350</text>
  </g>

  <!-- Yellow SUV -->
  <g transform="translate(580, 348) rotate(-4)">
    <ellipse cx="26" cy="22" rx="30" ry="7" fill="#000000" fill-opacity="0.25" />
    <rect x="0" y="4" width="52" height="18" rx="6" fill="#F59E0B" stroke="#2B3A42" stroke-width="2.2" />
    <path d="M 10 4 L 16 -6 L 36 -6 L 44 4 Z" fill="#FDE68A" stroke="#2B3A42" stroke-width="2.2" />
    <line x1="26" y1="-6" x2="26" y2="4" stroke="#2B3A42" stroke-width="1.5" />
    <line x1="12" y1="-8" x2="40" y2="-8" stroke="#2B3A42" stroke-width="2" stroke-linecap="round" />
    <rect x="15" y="-15" width="12" height="6" rx="2" fill="#3B82F6" stroke="#2B3A42" stroke-width="1.2" />
    <rect x="29" y="-17" width="10" height="8" rx="2" fill="#D9826C" stroke="#2B3A42" stroke-width="1.2" />
    <circle cx="12" cy="22" r="6" fill="#2B3A42" />
    <circle cx="12" cy="22" r="2.5" fill="#FAF7F0" />
    <circle cx="40" cy="22" r="6" fill="#2B3A42" />
    <circle cx="40" cy="22" r="2.5" fill="#FAF7F0" />
    <polygon points="52,9 74,4 74,19 52,14" fill="#FEF08A" opacity="0.45" />
  </g>

  <!-- Waypoints -->
  ${waypointsSVG}

  <!-- Bottom Curated Travel Journal Notes -->
  <g transform="translate(60, 580)">
    <rect width="1080" height="48" rx="10" fill="#FFFFFF" stroke="#2B3A42" stroke-width="1.8" filter="url(#cardShadow)" />
    <text x="24" y="30" font-size="13" font-weight="900" fill="#2B3A42" font-family="'PingFang SC', sans-serif">
      🏷️ 核心地标巡礼：
    </text>
    ${spots.slice(0, 4).map((lm, i) => `
      <g transform="translate(${160 + i * 210}, 10)">
        <rect width="195" height="28" rx="6" fill="#FAF7F0" stroke="#8FA89B" stroke-width="1.2" />
        <text x="14" y="19" font-size="12">📍</text>
        <text x="34" y="19" font-size="12" font-weight="bold" fill="#334155" font-family="'PingFang SC', sans-serif">${lm.slice(0, 9)}</text>
      </g>
    `).join('')}
  </g>
</svg>`;
  }

  if (type === 'food') {
    // 示例 4: 手绘水彩美食品鉴图鉴
    const dishItems = dishes.slice(0, 4);
    while (dishItems.length < 4) dishItems.push(`${cleanDest}风味小吃`);
    const icons = ['🍲', '🥢', '🥘', '🥟'];

    const dishCards = dishItems.map((dish, idx) => {
      const cx = 80 + idx * 260;
      return `
        <!-- Dish Card ${idx + 1} -->
        <g transform="translate(${cx}, 220)">
          <rect width="235" height="340" rx="14" fill="#FFFFFF" stroke="#2B3A42" stroke-width="2.2" filter="url(#cardShadow)" />
          <rect x="2" y="2" width="231" height="65" rx="12" fill="#E2EBE4" />
          <circle cx="45" cy="35" r="22" fill="#FAF7F0" stroke="#2B3A42" stroke-width="1.8" />
          <text x="45" y="43" font-size="22" text-anchor="middle">${icons[idx]}</text>
          
          <rect x="80" y="24" width="70" height="22" rx="4" fill="#C68B59" />
          <text x="115" y="39" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="'PingFang SC', sans-serif">非遗风味 ${idx + 1}</text>

          <!-- Steaming Bowl Illustration -->
          <g transform="translate(117, 150)">
            <ellipse cx="0" cy="35" rx="48" ry="12" fill="#000000" fill-opacity="0.1" />
            <path d="M -15 -10 Q -20 -30, -10 -45 Q 0 -60, -12 -75" fill="none" stroke="#6B8E9B" stroke-width="2" stroke-linecap="round" opacity="0.6" />
            <path d="M 0 -8 Q 10 -25, 5 -42 Q 0 -58, 8 -72" fill="none" stroke="#8FA89B" stroke-width="2.2" stroke-linecap="round" opacity="0.7" />
            <path d="M 15 -10 Q 25 -28, 18 -45 Q 12 -60, 20 -75" fill="none" stroke="#D9826C" stroke-width="1.8" stroke-linecap="round" opacity="0.5" />
            <ellipse cx="0" cy="0" rx="48" ry="20" fill="#FAF7F0" stroke="#2B3A42" stroke-width="2" />
            <ellipse cx="0" cy="-2" rx="42" ry="15" fill="#C68B59" opacity="0.3" />
            <path d="M -48 0 C -48 35, 48 35, 48 0 Z" fill="#FFFFFF" stroke="#2B3A42" stroke-width="2.2" />
            <path d="M -35 10 Q 0 25, 35 10" fill="none" stroke="#8FA89B" stroke-width="3" stroke-linecap="round" opacity="0.7" />
          </g>

          <text x="117" y="245" font-size="16" font-weight="900" fill="#1E293B" text-anchor="middle" font-family="'PingFang SC', sans-serif">${dish.slice(0, 10)}</text>
          <text x="117" y="270" font-size="12" font-weight="500" fill="#64748B" text-anchor="middle" font-family="'PingFang SC', sans-serif">地道风味 · 慢火细炖 · 老少皆宜</text>
          <line x1="30" y1="290" x2="205" y2="290" stroke="#E2E8F0" stroke-width="1.5" />
          <text x="117" y="315" font-size="11" font-weight="bold" fill="#C68B59" text-anchor="middle" font-family="'PingFang SC', sans-serif">★★★★★ 招牌美食品鉴</text>
        </g>
      `;
    }).join('\n');

    return `<svg viewBox="0 0 1200 675" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>${commonDefs}</defs>
  <rect width="1200" height="675" fill="#FAF7F0" />
  <ellipse cx="200" cy="560" rx="320" ry="160" fill="url(#meadowWash)" />
  <ellipse cx="1020" cy="160" rx="280" ry="150" fill="url(#skyWash)" />

  <rect x="24" y="24" width="1152" height="627" rx="18" fill="none" stroke="#2B3A42" stroke-width="2.5" />
  <rect x="32" y="32" width="1136" height="611" rx="14" fill="none" stroke="#C68B59" stroke-width="1.2" stroke-dasharray="8,6" opacity="0.75" />

  ${botanicalDoodles}

  <!-- Header -->
  <g transform="translate(60, 55)">
    <rect width="680" height="85" rx="14" fill="#FFFFFF" stroke="#2B3A42" stroke-width="2.2" filter="url(#cardShadow)" />
    <text x="24" y="42" font-size="25" font-weight="900" fill="#1E293B" font-family="'PingFang SC', sans-serif">
      🍲 ${cleanDest} 地道风味美食巡礼与水彩图鉴
    </text>
    <text x="24" y="68" font-size="13" font-weight="bold" fill="#C68B59" font-family="'PingFang SC', sans-serif">
      WATERCOLOR CULINARY JOURNAL ｜ 舌尖上的非遗名馔 ｜ 少油软糯清淡宜家
    </text>
  </g>

  <!-- Stamp Badge (Right) -->
  <g transform="translate(1010, 55)">
    <circle cx="50" cy="50" r="46" fill="#FAF7F0" stroke="#C68B59" stroke-width="2" stroke-dasharray="6,3" />
    <text x="50" y="44" font-size="11" font-weight="bold" fill="#C68B59" text-anchor="middle" font-family="'PingFang SC', sans-serif">TASTE OF</text>
    <text x="50" y="62" font-size="15" font-weight="900" fill="#78350F" text-anchor="middle" font-family="'PingFang SC', sans-serif">${cleanDest}</text>
    <text x="50" y="78" font-size="9" font-weight="bold" fill="#C68B59" text-anchor="middle" font-family="'PingFang SC', sans-serif">★ 必吃手账 ★</text>
  </g>

  ${dishCards}

  <!-- Footer Tip -->
  <g transform="translate(80, 590)">
    <rect width="1040" height="38" rx="8" fill="#FFFFFF" stroke="#8FA89B" stroke-width="1.5" />
    <text x="20" y="24" font-size="12" font-weight="bold" fill="#2B3A42" font-family="'PingFang SC', sans-serif">
      💡 适老宜幼用餐提示：精选少油微盐、提供软糯易嚼主食且具有家庭无烟包厢的口碑老字号，支持提前取号！
    </text>
  </g>
</svg>`;
  }

  // scenery1 (Natural Landscape) or scenery2 (Historic / Cultural Citywalk)
  const isNature = type === 'scenery1';
  const scenicTitle = isNature ? (spots[0] || `${destination}核心自然风光`) : (spots[1] || spots[0] || `${destination}特色人文古街`);
  const subtitle = isNature ? '天然氧吧 · 平缓栈道 · 绝美自然全景' : '千年文脉 · 石板古巷 · 璀璨夜游慢步';
  const themeColor = isNature ? '#6E8B74' : '#C68B59';

  return `<svg viewBox="0 0 1200 675" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>${commonDefs}</defs>
  <rect width="1200" height="675" fill="#FAF7F0" />
  <rect x="24" y="24" width="1152" height="627" rx="18" fill="none" stroke="#2B3A42" stroke-width="2.5" />
  <rect x="32" y="32" width="1136" height="611" rx="14" fill="none" stroke="${themeColor}" stroke-width="1.2" stroke-dasharray="8,6" opacity="0.75" />

  ${botanicalDoodles}
  ${isNature ? compassRose : ''}

  <!-- Main Illustration Canvas Card -->
  <g transform="translate(60, 50)">
    <rect width="1080" height="460" rx="16" fill="#FAF7F0" stroke="#2B3A42" stroke-width="2.2" filter="url(#cardShadow)" />
    <rect x="2" y="2" width="1076" height="456" rx="14" fill="${isNature ? 'url(#skyWash)' : 'url(#meadowWash)'}" opacity="0.7" />

    <!-- Soft Watercolor Sun Glow -->
    <circle cx="920" cy="110" r="42" fill="#FDE047" opacity="0.7" />
    <circle cx="920" cy="110" r="56" fill="#FEF08A" opacity="0.3" />

    <!-- Fluffy Clouds -->
    <ellipse cx="260" cy="85" rx="55" ry="16" fill="#FFFFFF" opacity="0.9" />
    <ellipse cx="285" cy="75" rx="35" ry="20" fill="#FFFFFF" opacity="0.9" />
    <ellipse cx="700" cy="110" rx="65" ry="18" fill="#FFFFFF" opacity="0.8" />

    ${isNature ? `
      <!-- Mountain Layers -->
      <polygon points="60,456 340,180 620,456" fill="url(#mountainShadow)" stroke="#2B3A42" stroke-width="1.8" />
      <polygon points="340,180 620,456 660,456 340,180" fill="url(#mountainSun)" stroke="#2B3A42" stroke-width="1.8" />
      <polygon points="340,180 300,230 330,225 340,240 365,225 390,240 340,180" fill="#FAF8F5" stroke="#2B3A42" stroke-width="1.2" />

      <polygon points="460,456 720,130 980,456" fill="url(#mountainShadow)" stroke="#2B3A42" stroke-width="2" />
      <polygon points="720,130 980,456 1020,456 720,130" fill="url(#mountainSun)" stroke="#2B3A42" stroke-width="2" />
      <polygon points="720,130 680,200 705,190 720,210 745,190 780,210 720,130" fill="#FFFFFF" stroke="#2B3A42" stroke-width="1.5" />

      <!-- Foothills & Forest -->
      <path d="M 0 456 Q 300 370, 600 420 T 1080 390 L 1080 456 Z" fill="#8FA89B" opacity="0.85" />
      <path d="M 0 456 Q 400 410, 800 390 T 1080 430 L 1080 456 Z" fill="#6E8B74" />

      <!-- Wooden Boardwalk with Handrail -->
      <path d="M 120 456 Q 540 360, 960 456" fill="none" stroke="#C68B59" stroke-width="14" stroke-linecap="round" />
      <path d="M 120 456 Q 540 360, 960 456" fill="none" stroke="#FAF7F0" stroke-width="2" stroke-dasharray="10,10" />
      
      <!-- Miniature Family Travelers Walking -->
      <g transform="translate(520, 375)">
        <circle cx="10" cy="5" r="4" fill="#2B3A42" />
        <path d="M 10 9 L 10 24 L 6 34 M 10 24 L 14 34 M 4 15 L 16 15" stroke="#2B3A42" stroke-width="2" stroke-linecap="round" />
        <circle cx="28" cy="8" r="3.5" fill="#D9826C" />
        <path d="M 28 12 L 28 25 L 24 34 M 28 25 L 32 34 M 22 17 L 34 17" stroke="#D9826C" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="44" cy="14" r="3" fill="#F59E0B" />
        <path d="M 44 17 L 44 26 L 41 33 M 44 26 L 47 33" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" />
        <circle cx="48" cy="2" r="4" fill="#DC2626" />
        <line x1="44" y1="20" x2="48" y2="6" stroke="#2B3A42" stroke-width="0.8" />
      </g>
    ` : `
      <!-- Ancient Traditional Street Architecture -->
      <g transform="translate(140, 240)">
        <rect x="0" y="50" width="220" height="166" fill="#8FA89B" opacity="0.3" stroke="#2B3A42" stroke-width="1.8" />
        <path d="M -20 50 Q 110 5, 240 50 L 220 50 Q 110 20, 0 50 Z" fill="#C68B59" stroke="#2B3A42" stroke-width="2" />
        <rect x="30" y="80" width="60" height="50" rx="4" fill="#FEF08A" stroke="#2B3A42" stroke-width="1.5" />
        <rect x="130" y="80" width="60" height="50" rx="4" fill="#FDE047" stroke="#2B3A42" stroke-width="1.5" />
        <circle cx="10" cy="65" r="7" fill="#DC2626" stroke="#2B3A42" stroke-width="1.2" />
      </g>

      <g transform="translate(680, 180)">
        <rect x="0" y="60" width="260" height="216" fill="#6B8E9B" opacity="0.3" stroke="#2B3A42" stroke-width="1.8" />
        <path d="M -25 60 Q 130 10, 285 60 L 260 60 Q 130 25, 0 60 Z" fill="#D9826C" stroke="#2B3A42" stroke-width="2" />
        <rect x="40" y="100" width="80" height="60" rx="4" fill="#FEF08A" stroke="#2B3A42" stroke-width="1.5" />
        <rect x="150" y="100" width="70" height="60" rx="4" fill="#FDE047" stroke="#2B3A42" stroke-width="1.5" />
        <circle cx="20" cy="75" r="8" fill="#DC2626" stroke="#2B3A42" stroke-width="1.2" />
      </g>

      <!-- Stone Arch Bridge & Stream -->
      <path d="M 0 456 Q 540 370, 1080 456" fill="none" stroke="#7FA8B8" stroke-width="32" stroke-linecap="round" />
      <path d="M 280 456 Q 540 330, 800 456" fill="none" stroke="#FAF7F0" stroke-width="18" stroke-linecap="round" />
      <path d="M 280 456 Q 540 330, 800 456" fill="none" stroke="#2B3A42" stroke-width="2" stroke-dasharray="12,6" />

      <!-- Directional Pedestrian Route Arrows -->
      <g fill="#F59E0B" stroke="#2B3A42" stroke-width="1">
        <polygon points="440,370 452,375 440,380 443,375" />
        <polygon points="620,370 632,375 620,380 623,375" />
      </g>
    `}

    <!-- Title Badge on the Illustration -->
    <g transform="translate(40, 40)">
      <rect width="480" height="80" rx="12" fill="#FFFFFF" stroke="#2B3A42" stroke-width="2" filter="url(#cardShadow)" />
      <text x="24" y="38" font-size="22" font-weight="900" fill="#1E293B" font-family="'PingFang SC', sans-serif">
        ${isNature ? '🏞️' : '🏮'} ${scenicTitle.slice(0, 14)}
      </text>
      <text x="24" y="64" font-size="12" font-weight="bold" fill="${themeColor}" font-family="'PingFang SC', sans-serif">
        ${cleanDest}核心打卡 ｜ ${subtitle}
      </text>
    </g>
  </g>

  <!-- Bottom Detailed Information Bar -->
  <g transform="translate(60, 535)">
    <rect width="1080" height="85" rx="12" fill="#FFFFFF" stroke="${themeColor}" stroke-width="1.8" filter="url(#cardShadow)" />
    <text x="30" y="34" font-size="15" font-weight="900" fill="#1E293B" font-family="'PingFang SC', sans-serif">
      【水彩手账慢游指引】${scenicTitle}：
    </text>
    <text x="30" y="62" font-size="13" font-weight="500" fill="#334155" font-family="'PingFang SC', sans-serif">
      ${isNature ? 
        '路线已预先规划平缓观光车通道与亲水无障碍木栈道，适宜携带老人与推婴儿车家庭，避开陡峭阶梯，享受微风与全景视野。' : 
        '建议安排在下午傍晚时分游览，街区华灯初上，可体验传统茶社听曲与非遗手工艺，漫步石板小巷，感受历史文脉之美。'}
    </text>
  </g>
</svg>`;
}

// Extracts actual daily stops, landmarks, and culinary dishes from the generated roadbook

module.exports = { generateDynamicRoadbookSVG };
