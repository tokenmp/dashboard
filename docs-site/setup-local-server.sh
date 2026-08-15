#!/usr/bin/env bash
# 一次性配置：让本机 1Panel-openresty 在 /docs 路径服务文档静态站。
# 需要 root（写 /opt/1panel/www + 重载 openresty），请用 sudo 运行。
# 幂等：重复执行无副作用。
#
#   sudo ./setup-local-server.sh
set -euo pipefail
cd "$(dirname "$0")"

OPENRESTY_CONTAINER="${OPENRESTY_CONTAINER:-1Panel-openresty-H6FS}"
WWW=/opt/1panel/www
CONF=$WWW/conf.d/dashboard.local.conf
DEST_ROOT=$WWW/tokenmp-docs      # 容器内对应 /www/tokenmp-docs
DEST_DIR=$DEST_ROOT/docs         # 产物目录多一层 docs/，配合 nginx root

# 1. 文档目录
mkdir -p "$DEST_DIR"

# 2. 首次发布
if [[ ! -f "$DEST_DIR/index.html" ]]; then
  if [[ -d .vitepress/dist ]]; then
    cp -r .vitepress/dist/. "$DEST_DIR/"
    echo "已发布 .vitepress/dist -> $DEST_DIR"
  else
    echo "警告：$DEST_DIR 为空且本地无 .vitepress/dist，稍后请跑 ./deploy.sh" >&2
  fi
fi

# 3. 注入 /docs location（幂等；已是 root 布局则跳过）
if grep -q 'location /docs/' "$CONF"; then
  echo "conf 已包含 /docs location，跳过"
else
  cp "$CONF" "$CONF.bak-docs"
  python3 - "$CONF" <<'PY'
import sys

conf_path = sys.argv[1]
with open(conf_path) as f:
    content = f.read()

block = """\

    # 旧路径 /docs/tools/* → /docs/guide/tools/*（2026-08-15 目录调整）
    location ^~ /docs/tools/ {
        rewrite ^/docs/tools/(.*)$ /docs/guide/tools/$1 permanent;
    }

    # /docs 无尾斜杠 → 301 到 /docs/（否则落入 SPA 反代 404）
    location = /docs {
        return 301 /docs/;
    }

    # TokenMP 文档站（VitePress 纯静态产物，宿主 /opt/1panel/www/tokenmp-docs/docs）
    # cleanUrls：无扩展名路径需尝试 $uri.html（产物目录带 docs/ 层级以配合 root）
    location /docs/ {
        root /www/tokenmp-docs;
        index index.html;
        try_files $uri $uri.html $uri/ /docs/index.html;
    }

    # 带内容哈希的资源永久缓存（文件名变即失效）
    location /docs/assets/ {
        root /www/tokenmp-docs;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
"""

anchor = "    location / {"
pos = content.index(anchor)  # 找不到会抛错中止，避免误插
content = content[:pos] + block.lstrip("\n") + "\n" + content[pos:]
with open(conf_path, "w") as f:
    f.write(content)
print("已插入 /docs location（原配置备份为 .bak-docs）")
PY
fi

# 4. 校验并平滑重载
docker exec "$OPENRESTY_CONTAINER" nginx -t
docker exec "$OPENRESTY_CONTAINER" nginx -s reload
echo "完成：<站点根>/docs/"
