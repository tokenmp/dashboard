# TokenMP 文档站（VitePress）

与 `web/`（React 前端）相互独立：独立 `package.json`，不共享依赖。

## 本地开发

```bash
cd docs-site
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 .vitepress/dist/
```

## 部署（随 dashboard 镜像一起发布）

文档站**由 dashboard 容器自己托管**，没有独立的部署脚本，也不需要手工发布：

```
dashboard/Dockerfile
  └─ stage "docs"    node:24-alpine → npm run build（vitepress，base=/docs/）
        └─ 产物拷进运行时镜像的 public/docs
              └─ 容器内 Caddy 的 handle /docs/* 提供（见 dashboard/Caddyfile）
```

因此：**改完文档站，只要走 dashboard 的常规发布流程即可**（预览 `v*` → 线上 `prod-v*`）。
详见 `dashboard/docs/deployment.md`。

访问路径为 `https://<域名>/docs/`（正式 `api.tokenmp.cn/docs/`，预览 `next.tokenmp.cn/docs/`）。
Caddy 侧要点：

- `try_files {path} {path}.html` 支持 cleanUrls 无后缀路径；
- `/docs/assets/*` 加 `max-age=31536000, immutable`；
- 未命中时回退 `/docs/404.html` 并保留状态码。

> 历史做法（已废弃）：早期用 `docs-site/deploy.sh` + `setup-local-server.sh` 把产物发布到
> 本机 1Panel-openresty 的 `/opt/1panel/www/tokenmp-docs`。自文档站并入 dashboard 镜像后，
> 这两个脚本已删除。

## 结构

```
.vitepress/config.ts      # 站点配置（base=/docs/，nav/sidebar）
.vitepress/theme/         # 主题覆盖（品牌蓝 #2563eb，对齐 landing 视觉）
index.md                  # 首页（layout: home）
guide/                    # 指南：quickstart / plans / billing
api/                      # API 参考
```

## 约定

- `base` 固定 `/docs/`（子路径部署）；将来切 `docs.` 子域名时改回 `/` 并同步调整 `dashboard/Caddyfile`。
- 控制台入口等**站外链接**必须写完整 URL（VitePress 会给 `/` 开头的链接拼上 base）。
- 视觉对齐 landing 约束：单一蓝 `#2563eb` + zinc 黑白灰、无 emoji（首页 features 的
  emoji 是临时占位，定稿前换成 SVG 图标组件）。
