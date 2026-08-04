# TokenMP Dashboard

ThinkPHP 8（后端）+ React / Vite / TypeScript（前端）一体化项目。

## 技术栈

- **后端**：ThinkPHP 8.0 + PHP 8.4
- **前端**：Vite + React 19 + TypeScript + TailwindCSS + shadcn/ui
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

## Docker 部署

项目提供基于 **FrankenPHP（Caddy + PHP）** 的单容器生产镜像，多阶段构建：
Node 构建前端 → Composer 安装依赖 → FrankenPHP 运行时。镜像**不内置 `.env`**，配置通过环境变量注入。

### 一键运行（docker compose）

```bash
# 生产务必先设强随机密钥（HS256 要求 ≥ 32 字节）
export JWT_SECRET=$(openssl rand -hex 32)

docker compose up -d --build      # http://localhost:8080
docker compose logs -f            # 查看日志
docker compose down               # 停止
```

`docker-compose.yml` 已带可用的默认值，改个 `JWT_SECRET` 即可跑通。

### 直接用 Docker

```bash
docker build -t tokenmp-dashboard .
docker run -d -p 8080:80 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e APP_DEBUG=false \
  tokenmp-dashboard
```

### 配置注入

ThinkPHP 的 `env()` 读取 `$_ENV`，FrankenPHP 镜像 `variables_order=EGPCS`，
故 `-e` / compose `environment` 直接生效，无需镜像内置 `.env`：

| 变量 | 说明 | 示例 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥，**≥ 32 字节**，必填 | `openssl rand -hex 32` |
| `JWT_EXPIRE` | Token 有效期（秒） | `604800` |
| `JWT_PREFIX` | Authorization 头前缀 | `Bearer` |
| `APP_DEBUG` | 调试模式（生产置 `false`） | `false` |
| `DB_*` | 数据库配置（接入 DB 时） | 见 `.example.env` |

### 路由说明

`Caddyfile` 用 `try_files` 把非静态请求重写到 ThinkPHP 兼容模式 `/index.php?s=<path>`，
绕开 FrankenPHP 未设置 `PATH_INFO`、而 ThinkPHP 非 CLI 又不读 `REQUEST_URI` 的问题。
静态资源（`/static/assets/*`、`/tokenmp.svg`）由 Caddy 直接返回。

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
