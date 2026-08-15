############################################
# Stage 1: 构建前端（Vite → public/static）
############################################
FROM node:24-alpine AS frontend
WORKDIR /build

# 先拷 lock 文件，利用 Docker 层缓存
COPY web/package.json web/package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY web/ ./
# vite outDir = ../public/static，故产物落在 /public/static
RUN npm run build

############################################
# Stage 1b: 构建文档站（VitePress → public/docs）
############################################
FROM node:24-alpine AS docs
WORKDIR /build

# 先拷 lock 文件，利用 Docker 层缓存
COPY docs-site/package.json docs-site/package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY docs-site/ ./
# vitepress outDir = .vitepress/dist（base 已配置为 /docs/），挪到 /out/docs 供运行时拷贝
RUN npm run build && mkdir -p /out && mv .vitepress/dist /out/docs

############################################
# Stage 2: 安装 PHP 依赖（composer）
############################################
FROM composer:2 AS composer
WORKDIR /app
COPY composer.json ./
# 项目约定不提交 composer.lock，故按 composer.json 解析
# --no-scripts：跳过 service:discover/vendor:publish，运行时惰性发现即可
RUN composer install \
      --no-dev \
      --optimize-autoloader \
      --no-interaction \
      --no-scripts

############################################
# Stage 3: 运行时（FrankenPHP = Caddy + PHP）
############################################
FROM dunglas/frankenphp:1-php8.4-alpine AS runtime

# 国内镜像源加速 apk（install-php-extensions 编译 pgsql 需拉 llvm/clang 等大包）
RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g' /etc/apk/repositories

# 生产所需 PHP 扩展（pdo_mysql / pdo_pgsql 为后续真实用户/数据库预留）
RUN install-php-extensions pdo_mysql pdo_pgsql pgsql

# git：scripts/sync-releases.php 需读取 git tag 同步版本日志
RUN apk add --no-cache git

WORKDIR /app

# 应用源码（直接来自构建上下文，避免把 web/ 源码带入运行时）
COPY app app
COPY config config
COPY route route
COPY extend extend
COPY view view
COPY public public
COPY think .
COPY composer.json .
COPY scripts scripts

# 优化后的 vendor（来自 composer 阶段）
COPY --from=composer /app/vendor vendor

# 前端构建产物（来自 frontend 阶段）
COPY --from=frontend /public/static public/static

# 文档站构建产物（来自 docs 阶段，经 public/docs 提供 /docs 子路径）
COPY --from=docs /out/docs public/docs

# 自定义 Caddyfile（ThinkPHP 兼容模式路由：解决 FrankenPHP 不设 PATH_INFO）
COPY Caddyfile /etc/frankenphp/Caddyfile

# 运行时配置：通过环境变量注入
# （ThinkPHP 的 env() 构造时读取 $_ENV，frankenphp 镜像 variables_order=EGPCS，
#  故 docker -e / compose environment 均可直接生效，无需镜像内置 .env）
# 需提供：JWT_SECRET / JWT_EXPIRE / JWT_PREFIX / APP_DEBUG（及 DB_* 等）
ENV SERVER_NAME=:80

EXPOSE 80
