#!/usr/bin/env bash
# 构建前端并同步到运行中的 dashboard 容器（开发预览用）。
#
# 用途：改了 web/ 下的代码后，一条命令产出新构建并塞进正在跑的容器，
#       刷新浏览器即可看到效果，无需重建镜像。
#
# 注意：此脚本依赖名为 tokenmp-dashboard 的容器正在运行。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 构建前端 (web/)"
( cd web && pnpm build )

echo "==> 同步到容器 tokenmp-dashboard:/app/public/static/"
docker cp public/static/index.html tokenmp-dashboard:/app/public/static/index.html
docker cp public/static/assets/. tokenmp-dashboard:/app/public/static/assets/

echo "✓ 完成。刷新浏览器即可（必要时 Ctrl+Shift+R 清缓存）。"
