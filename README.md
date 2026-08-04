# TokenMP Dashboard

ThinkPHP 8（后端）+ React / Vite / TypeScript（前端）一体化项目。

## 技术栈

- **后端**：ThinkPHP 8.0 + PHP 8.4
- **前端**：Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui
- **路由**：React Router v7
- **HTTP**：axios
- **状态管理**：Zustand

## 目录结构

```
dashboard/
├── app/            # ThinkPHP 应用层
├── config/         # ThinkPHP 配置
├── route/          # 路由（含 SPA 兜底）
├── public/         # Web 根目录
│   └── static/     # 前端构建产物（由 Vite 输出，被 git 忽略）
├── view/           # SPA 入口 HTML 模板
└── web/            # React 前端源码（不直接对外访问，所有 npm 命令在此执行）
```

> 项目根目录不使用 npm；前端命令一律在 `web/` 下执行，后端命令用 `php think`。

## 环境要求

- PHP >= 8.0（推荐 8.4）
- Node.js >= 18（推荐 24）
- Composer

## 快速开始

### 1. 安装依赖

```bash
composer install          # 后端依赖
cd web && npm install     # 前端依赖
```

### 2. 开发模式（开两个终端）

```bash
# 终端 1：后端
php think run                          # http://localhost:8000

# 终端 2：前端
cd web && npm run dev                  # http://localhost:5173
```

👉 **浏览器访问 `http://localhost:5173`**，Vite 会自动把 `/api/*`、`/tokenmp.svg`、
`/favicon.ico` 代理到 8000 端口，前后端同源，无需处理跨域。

### 3. 生产构建

```bash
cd web && npm run build
```

构建产物输出到 `public/static/`（`index.html` + `assets/*`），由 Web 服务器直接提供。

## 环境变量

前端环境变量位于 `web/`，**均不提交**（已 gitignore），按模板复制：

```bash
cd web
cp .env.example .env.development   # 开发模式
cp .env.example .env.production    # 生产构建（可选，变量均有默认值）
```

| 变量 | 用途 | 默认值 |
|---|---|---|
| `VITE_API_BASE_URL` | axios 请求基础路径 | `/api` |
| `VITE_API_TARGET` | 开发期 Vite 代理目标（指向 ThinkPHP） | `http://localhost:8000` |
