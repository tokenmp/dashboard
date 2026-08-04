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
├── web/            # React 前端源码（不直接对外访问）
└── package.json    # 根脚本（统一启动前后端）
```

## 环境要求

- PHP >= 8.0（推荐 8.4）
- Node.js >= 18（推荐 24）
- Composer

## 快速开始

### 1. 安装依赖

```bash
composer install          # 后端依赖
npm install               # 根脚本依赖（concurrently）
npm run install:web       # 前端依赖（web/ 目录）
```

### 2. 开发模式

```bash
npm run dev
```

该命令会同时启动：

- ThinkPHP 开发服务器：`http://localhost:8000`（API）
- Vite 开发服务器：`http://localhost:5173`（前端）

👉 **浏览器请访问 `http://localhost:5173`**，Vite 会自动把 `/api/*` 请求代理到 8000 端口。

也可以单独启动：

```bash
npm run dev:api    # 仅后端
npm run dev:web    # 仅前端
```

### 3. 生产构建

```bash
npm run build
```

构建产物输出到 `public/static/`（`index.html` + `assets/*`），由 Web 服务器直接提供。

## 环境变量

前端环境变量位于 `web/`：

| 文件 | 用途 |
|---|---|
| `.env.development` | 开发环境（`VITE_API_BASE_URL=/api`，`VITE_API_TARGET=http://localhost:8000`） |
| `.env.production` | 生产环境（`VITE_API_BASE_URL=/api`） |
