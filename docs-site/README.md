# TokenMP 文档站（VitePress）

与 `web/`（React 前端）相互独立：独立 `package.json`，不共享依赖。

## 本地开发

```bash
cd docs-site
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 .vitepress/dist/
```

## 部署（本机 1Panel-openresty）

```bash
sudo ./setup-local-server.sh   # 一次性：建目录 + 注入 /docs location + reload（幂等）
./deploy.sh                    # 日常：构建 + 发布到 /opt/1panel/www/tokenmp-docs
./deploy.sh --dry-run          # 只看会同步哪些文件
```

链路：宿主 `/opt/1panel/www` 挂载为 openresty 容器内 `/www`；产物发布到
`/opt/1panel/www/tokenmp-docs/docs/`（多一层 `docs/` 以配合 `root` 指令与
cleanUrls 的 `$uri.html` 匹配）。`dashboard.local.conf` 的 default_server 新增：

```nginx
location = /docs { return 301 /docs/; }          # 无尾斜杠兜底
location /docs/ {
    root /www/tokenmp-docs;
    index index.html;
    try_files $uri $uri.html $uri/ /docs/index.html;   # cleanUrls 深层路由
}
location /docs/assets/ {
    root /www/tokenmp-docs;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

## 结构

```
.vitepress/config.ts      # 站点配置（base=/docs/，nav/sidebar）
.vitepress/theme/         # 主题覆盖（品牌蓝 #2563eb，对齐 landing 视觉）
index.md                  # 首页（layout: home）
guide/                    # 指南：quickstart / plans / billing
api/                      # API 参考
```

## 约定

- `base` 固定 `/docs/`（子路径部署）；将来切 `docs.` 子域名时改回 `/` 并调整 openresty。
- 控制台入口等**站外链接**必须写完整 URL（VitePress 会给 `/` 开头的链接拼上 base）。
- 视觉对齐 landing 约束：单一蓝 `#2563eb` + zinc 黑白灰、无 emoji（首页 features 的
  emoji 是临时占位，定稿前换成 SVG 图标组件）。
