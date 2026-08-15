#!/usr/bin/env bash
# 构建文档并发布到本机 openresty 静态目录。
# 目录布局：/opt/1panel/www/tokenmp-docs/docs/<dist 产物>（多一层 docs/ 以配合 nginx root + cleanUrls）
# 需 sudo（目录归 root）；首次部署前请先跑一次：sudo ./setup-local-server.sh
# 用法：./deploy.sh [--dry-run]
set -euo pipefail
cd "$(dirname "$0")"

DEST_ROOT="/opt/1panel/www/tokenmp-docs"
DEST_DIR="$DEST_ROOT/docs"

echo "==> 构建"
npm run build

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "==> [dry-run] 将覆盖 $DEST_DIR，文件清单："
  tar -C .vitepress/dist -tf - < <(tar -C .vitepress/dist -cf - .) | sed 's|^\./||' | head -50
  exit 0
fi

echo "==> 同步到 $DEST_DIR"
# 先在本地备一份再让 root 原子替换，避免中途失败留下半空目录
STAGE=$(mktemp -d)
tar -C .vitepress/dist -cf - . | tar -C "$STAGE" -xf -
sudo rm -rf "${DEST_DIR}.new"
sudo cp -r "$STAGE" "${DEST_DIR}.new"
sudo rm -rf "$DEST_DIR"
sudo mv "${DEST_DIR}.new" "$DEST_DIR"
rm -rf "$STAGE"

echo "==> 完成。线上地址：<站点根>/docs/"
