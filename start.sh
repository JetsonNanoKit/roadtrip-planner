#!/usr/bin/env bash

# RoadTrip Planner - Plan your trip, enjoy on road!
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=8787

echo "=========================================================="
echo "  🚗 RoadTrip Planner: Plan your trip, enjoy on road!"
echo "=========================================================="
echo "正在检查运行环境与服务状态..."

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "❌ 错误: 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

# Check if port 8787 is already running
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "ℹ️  端口 $PORT 已在运行中，正在为您打开浏览器..."
else
    echo "🚀 启动本地 Web 后端服务 (:8787)..."
    node server.js &
    SERVER_PID=$!
    sleep 1
fi

echo "🌐 打开网页工作台: http://localhost:$PORT"
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:$PORT"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:$PORT" 2>/dev/null || true
fi

echo "✅ 服务已就绪！按 Ctrl+C 即可退出服务。"
