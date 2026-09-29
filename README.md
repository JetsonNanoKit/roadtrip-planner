# 🚗 RoadTrip Planner — 自驾路书一站式工作台

> **Plan your trip, enjoy on road!**

面向自驾游爱好者与家庭出游的一站式路书规划与发布工具：从行程参数输入、AI 结构化路书生成、手绘风插图排版，到一键同步飞书云文档的完整闭环。

## ✨ 核心特性

- **🎯 一键路书生成**：根据出发地、目的地、天数、家庭成员结构（长辈 / 儿童 / 成人）、车型与出行偏好，自动生成含每日四段式时间轴、海拔规划、餐饮住宿策略、门票预算明细的完整路书；
- **🏞️ 智能配图体系**：将路书全文连同绘图指令发送给生图模型，绘制一幅「出游路线手绘地图」作为开篇插图（AI 输出经本机 Chrome 无头渲染转为 PNG 位图，失败自动降级兜底，插图位永远有图）；
- **🎨 5 种插画风格**：手绘水彩（推荐）、复古水彩画报、吉卜力绘本、极简矢量、自定义提示词；
- **📝 双栏实时预览与编辑**：Markdown 源码编辑、排版预览、分屏对照三模式，支持全文复制与本地 `.md` 导出；
- **☁️ 飞书云文档直连**：基于已授权的飞书官方 CLI（lark-cli），一键将整篇路书连同插图推送到飞书「我的空间」；
- **⚡️ 零外部依赖**：纯原生 Node.js（无 `npm install`），克隆即启即用。

## 🚀 快速开始

要求：Node.js ≥ 18（使用了内置 `fetch`）。

```bash
git clone <your-repo-url> roadtrip-planner
cd roadtrip-planner
./start.sh          # 或：node server.js
```

然后浏览器访问 **http://localhost:8787**。

使用流程：

1. **配置行程**：左侧设置出发地、目的地、天数、长辈 / 儿童人数、车型等参数；
2. **生成 / 载入**：点击「✨ 载入经典案例模板」或「智能定制专属路书」；
3. **查阅与微调**：右侧预览排版，或切到「Markdown 源码编辑」个性化调整；
4. **一键同步飞书**：点击右上角「☁️ 一键同步到飞书」生成在线协同文档。

## ⚙️ 配置说明

### 服务端口

默认监听 `127.0.0.1:8787`，可通过环境变量修改：

```bash
PORT=9000 node server.js
```

> 服务仅绑定 127.0.0.1，不对局域网暴露；如需远程访问请自行加反向代理并启用认证。

### LLM 配置（路书生成）

在网页右上角「🤖 AI 模型配置」中填写，保存在浏览器 localStorage：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| API Key | 必填，OpenAI 兼容协议的 Bearer Key | — |
| Base URL | 服务商入口，自动归一化为 `…/v1/chat/completions` | `https://api.openai.com/v1` |
| 模型 | 任意 OpenAI 兼容模型（DeepSeek / Kimi / GLM / Gemini 等） | `gemini-3.1-pro-preview` |
| Client Header | 随请求携带的来源/成本统计标识（名称与值均可配） | `X-Client: roadtrip-planner` |

已适配的端点归一化规则见 `src/llm.js` 的 `normalizeEndpoint()`。

### 生图配置（插画生成）

同一配置面板下半部分。生图模型为下拉框三选一：

| 生图模型 | 通道 | 所需凭据 | 输出 |
| --- | --- | --- | --- |
| `nano-banana-pro`（推荐） | fal.ai Nano Banana Pro · 外采异步网关（异步提交+轮询，原生位图） | 网关 **接口地址 + AK / SK / 业务令牌 token**（自行向网关提供方申请，在面板填写） | PNG 直出，水彩参考图随请求直传 |
| `gpt-image-2` | fal.ai GPT Image 2 · 外采异步网关（异步提交+轮询，原生位图，最高 4K） | 同上（网关接口地址 + AK / SK / token） | PNG 直出；参考图仅支持公网 URL，本地参考图不随请求携带，风格由提示词描述 |
| `gemini-3.8-flash` | 多模态 LLM 输出 SVG | 复用上方 LLM 的 API Key | SVG 经本机 Chrome 无头渲染 + 水彩纸面后期转 PNG |

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| 网关接口地址 | 外采异步网关三件套：提交接口、查询接口、直连查询（可选，推荐） | —（需自行填写） |
| 分辨率 | 外采网关模型专用：1K / 2K / 4K（GPT Image 2 会映射为合规的 `宽x高` 显式尺寸） | `2K` |
| 画面比例 | 外采网关模型专用：auto / 16:9 / 9:16 | `16:9` |
| 生图 Base URL | SVG 兜底路径留空则复用 LLM 的地址 | 同 LLM |
| 尺寸 | SVG 兜底路径的输出分辨率 | `1792x1024` |
| 负面提示词 | 排除写实、3D 渲染等风格 | 见 `src/styles.js` |
| 风格参考图 | 可上传自定义参考图，默认使用内置水彩路书参考（仅 Nano Banana / SVG 路径生效） | `public/images/style_reference_watercolor_map.jpg` |

外采异步网关按 fal.ai Nano Banana Pro / GPT Image 2 的 Outsourcing Gateway 协议接入（异步提交 + 轮询）；网关域名属于部署环境信息，不在代码中硬编码。AK/SK 通过查询参数携带，仅保存在浏览器 localStorage 并经本地服务转发。

### 飞书同步（可选）

依赖本机已安装并授权的飞书官方 CLI：

```bash
# 安装（如未安装）
npm install -g @larksuite/cli   # 以飞书官方文档为准
```

授权方式（二选一）：

- **网页扫码（推荐）**：网页右上角飞书状态徽章显示「未授权」时点击它，或同步时遇到授权过期自动弹出扫码窗口——用飞书 App 扫描二维码即可完成 Device Flow 授权，无需命令行操作；
- **命令行**：`lark-cli auth login`。

网页右上角会显示飞书登录状态徽章；用户 token 过期后会自动续期，续期彻底失效时按上述方式重新扫码即可。

## 📁 项目结构

```
roadtrip-planner/
├── server.js          # 入口：HTTP 服务 + 路由（约 260 行）
├── src/
│   ├── config.js      # 端口、目录、MIME 类型
│   ├── utils.js       # JSON 响应、请求体解析（10MB 上限）、错误格式化
│   ├── styles.js      # 5 种插画风格预设与提示词
│   ├── imageLibrary.js# 内置目的地插画库 + Markdown 图片注入
│   ├── imageGen.js    # AI 生图 API 调用（Nano Banana 外采网关 / Gemini / Imagen / OpenAI 兼容）
│   ├── nanoBanana.js # fal.ai Nano Banana Pro 外采网关（异步提交+轮询）
│   ├── svgGenerator.js# 动态 SVG 插画生成（生图失败时的兜底）
│   ├── roadbookImages.js# 路书亮点提取 + 4 图编排
│   ├── llm.js         # LLM 端点归一化 + 路书生成主流程
│   ├── feishu.js      # lark-cli 封装（execFile，无 shell 注入）
│   └── static.js      # 静态文件服务（带路径穿越防护）
├── public/
│   ├── index.html     # 单页工作台（配置 / 编辑 / 预览 / 同步）
│   └── images/        # 内置插画素材与运行时生成的图片
├── templates/
│   └── chuanxi_13d.md # 内置经典案例：长沙→川西 13 天路书
└── start.sh           # 一键启动脚本
```

## 🔌 API 参考

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/status` | 查询 lark-cli 飞书登录状态 |
| GET | `/api/templates/chuanxi` | 载入长沙→川西 13 天经典模板 |
| POST | `/api/test-llm` | LLM 连通性测试 |
| GET | `/api/style-presets` | 获取插画风格预设 |
| POST | `/api/test-image-gen` | 生图连通性测试 |
| POST | `/api/generate-images` | 独立生成 / 重生成 4 张路书插画 |
| POST | `/api/replace-style` | 替换路书插画的风格 |
| POST | `/api/generate` | 主接口：LLM 生成完整路书并自动配图 |
| POST | `/api/sync-feishu` | 同步 Markdown 路书到飞书云文档 |

## 🔒 安全说明

- 静态服务对请求路径做 `resolve + 前缀校验`，路径穿越请求一律 404；
- 飞书 CLI 调用使用 `execFile` + 参数数组，不经过 shell 解析；
- 服务为同源架构，不输出 `Access-Control-Allow-Origin: *`；
- 请求体大小限制为 10 MB；
- LLM / 生图 API Key 仅保存在浏览器 localStorage 并经本地服务转发，不落盘。

## 🛠️ 已知边界

- `public/images/` 下的 `dyn_*.svg`、`ai_*.png`、`test_preview_*.svg` 为运行时产物，已加入 `.gitignore`；
- lark-cli 依赖飞书账号授权，token 失效后需重新 `lark-cli auth login`；
- 生图服务超时或失败时自动降级为 SVG 插画（版式一致、内容取自行程文本）。

## 📄 License

MIT
