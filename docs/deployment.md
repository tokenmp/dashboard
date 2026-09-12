# TokenMP 部署手册

本文件是 **dashboard 与 executor 两个仓库共同的部署契约**（executor 仓库的 `README.md` /
`AGENTS.md` 均指向此处）。

系统由两个容器化服务组成，共用同一个 PostgreSQL：

| 服务 | 仓库 | 运行形态 | 职责 |
|---|---|---|---|
| **dashboard** | `tokenmp/dashboard` | FrankenPHP（Caddy + PHP 8.4），容器内 80 | 控制面：`/api/v1/*` 管理 API + SPA 前端 + `/docs` 文档站 |
| **executor** | `tokenmp/executor` | Go 静态二进制，容器内 9000 | 数据面：`/v1/*` 模型转发、鉴权、选路、计费 |
| **postgres** | — | `postgres:17` 容器 | 唯一共享状态（迁移唯一源在 executor 仓库 `migrations/`） |

---

## 0. 三套环境总览

三套环境**互相隔离、互不影响**，靠端口号与库名区分：

| 环境 | 域名 | dashboard | executor | 数据库 | 镜像版本来源 | 由谁部署 |
|---|---|---|---|---|---|---|
| **本机** | `tokenmp.local`（slim） | `127.0.0.1:18180` | `127.0.0.1:18181` | `tokenmp`（本地卷） | 源码本地构建 | 手动 `docker compose` |
| **预览** | `next.tokenmp.cn` | `127.0.0.1:18280` | `127.0.0.1:18281` | `tokenmp_next` | `/opt/tokenmp/versions-next.env` | 推 `v*` tag（自动） |
| **线上** | `api.tokenmp.cn` | `127.0.0.1:18180` | `127.0.0.1:18181` | `tokenmp` | `/opt/tokenmp/versions.env` | 推 `prod-v*` tag（人工确认） |

```
                        ┌─ next.tokenmp.cn ─→ 18280 dashboard(预览) / 18281 executor(预览) ─┐
   宿主机 Caddy :80/:443┤                                                                  ├→ 同一 postgres 容器
                        └─ api.tokenmp.cn  ─→ 18180 dashboard(正式) / 18181 executor(正式) ─┘
                                                   ↑ 同一台机器上的两个 compose project
```

**关键纪律**

1. **`v*` 只发预览栈，绝不碰线上**。线上流量只有 `prod-v*` 才会变更。
2. **镜像不重建**：`v*` 时构建并打 tag，`prod-v*` 只搬运已在预览栈验证过的同一个镜像（`--no-build`）。
3. **数据库迁移不回滚**：全程走 expand-then-contract，旧版本代码必须能跑在新 schema 上。
4. 两个 compose 项目名不同（`tokenmp-next` vs 目录名），避免 `up` 顶掉另一个栈
   —— 这是 2026-08-17 事故的根因，两处 `docker-compose.next.yml` 都带 `name: tokenmp-next`。

---

## 1. 本机开发栈

完整细节见工作区 `local/README.md`（该目录目前**未纳入任何 git 仓库**，见文末「待办」）。

拓扑与端口刻意与线上正式栈对齐（18180 / 18181），便于对照排查：

```
https://tokenmp.local          ─┐
https://tokenmp.local/api/v1/* ─┴─→ dashboard (PHP 8.4 / FrankenPHP)   127.0.0.1:18180
https://tokenmp.local/v1/*     ────→ executor  (Go)                   127.0.0.1:18181
                                          ↓
                                 PostgreSQL 17  tokenmp 库             127.0.0.1:5432
```

```bash
cd local
sudo docker compose up -d --build     # 首次或改源码后
sudo docker compose ps                # 状态
sudo docker compose logs -f dashboard # 日志
sudo docker compose down              # 停止（-v 会删库）
```

- **迁移**由一次性 `migrate` 服务在 postgres healthy 后自动执行（用 Debian 版 postgres 镜像，
  因为 `migrate.sh` 是 bash 脚本，alpine 无 bash）。
- **`local/.env`** 由 `dashboard/scripts/gen-secrets.sh` 生成，dashboard 与 executor 共用
  ——`API_KEY_PEPPER` / `MASTER_ENCRYPTION_KEY` 必须一致，否则两边生成的 API Key 无法互验。
- **构建期走本机代理**（`127.0.0.1:7890`）：composer / goproxy 直连会超时。
- **域名映射**由 [slim](https://slim.sh) 提供：`slim start tokenmp.local --port 18180 --route /v1=18181`。

### 本机仅有的两个坑（换机器会复现）

| 坑 | 症状 | 处理 |
|---|---|---|
| `.local` 与 mDNS 冲突 | 浏览器空白/转圈，`curl` 报无法解析主机 | `/etc/nsswitch.conf` 里把 `files [SUCCESS=return]` 提到 `mdns_minimal` **之前**；或改用 `.test` 域名 |
| Chromium 不信任 slim 根 CA | 地址栏「不安全」，但 `curl` 正常 | `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "slim Root CA" -i ~/.slim/ca/rootCA.pem`，然后**真正重启**浏览器（`chrome://restart` 无效） |

---

## 2. 预览环境（next.tokenmp.cn）

**触发**：在已合并进 `main` 的提交上打 `v*` tag 并推送。两个仓库各自独立触发，只更新被打 tag 的那个服务。

```bash
# dashboard
git tag v1.0.24 && git push origin v1.0.24
# executor（含迁移）
git tag v1.0.18 && git push origin v1.0.18
```

**dashboard `v*`**（`.github/workflows/deploy.yml`）：
`ssh → git fetch/checkout $TAG → docker build → 写 versions-next.env 的 DASHBOARD_VERSION →
compose -f docker-compose.next.yml up --force-recreate → 冒烟 18280 / 与 /api/v1/site/overview`

**executor `v*`**（`.github/workflows/deploy.yml`）：
`ssh → git fetch/checkout $TAG → docker build --build-arg VERSION=$TAG →` **先对 `tokenmp_next`
库跑 `scripts/migrate.sh`**（expand-then-contract）`→ 写 versions-next.env 的 EXECUTOR_VERSION →
compose -f docker-compose.next.yml up --force-recreate → 核对 18281 /healthz 的 version`

> **注意**：迁移只由 executor 的流程执行（唯一源在 executor 仓库）。dashboard 的 `v*` 不跑迁移。

**镜像 tag 即 git tag**（如 `tokenmp-executor:v1.0.18`），`/healthz` 返回的 `version` 与之一致，
可用 `curl -s 127.0.0.1:18281/healthz` 交叉核对。

**预览栈与正式栈共用 `/opt/tokenmp/secrets.env`**（同一份密钥），但库与 runtime 卷各自独立
（`data-next/`）。

---

## 3. 线上环境（api.tokenmp.cn）

**触发**：打 `prod-v*` tag（**人工确认动作**，Agent 不得自行发起）。

```bash
cd executor && git tag prod-v1.0.18 && git push origin prod-v1.0.18
```

`executor/.github/workflows/promote.yml` 在服务器上依次执行：

1. **前置检查**：读 `versions-next.env` 的两个版本号 → 确认两个镜像都存在于本机
   → 确认预览栈 executor 的 `/healthz` 版本正是该版本、dashboard 的 site API 可达。
2. **对正式库 `tokenmp` 跑迁移**：`git checkout $EV` 后，用
   `docker run --rm --network postgres-redis_default -v /opt/tokenmp-executor:/repo postgres:17-alpine bash /repo/scripts/migrate.sh`。
3. **写版本并重建**：备份 `versions.env` → 写入新版本号 → 重建 dashboard(`docker-compose.1panel.yml`)
   与 executor(`docker-compose.yml`) 两个正式容器（`--no-build`，只切镜像）。
4. **冒烟**：`18181/healthz` 版本匹配 + `https://api.tokenmp.cn/api/v1/site/overview` 可达；
   任一失败执行 `rollback()`——恢复 `versions.env.bak_<ts>` 并重建旧镜像容器。

成功后在 `/opt/tokenmp/last-promote.txt` 留下 `promoted_by / dashboard / executor / ts` 记录。

### 线上回滚

**不需要重跑 workflow。** 改回版本号再重建即可（`.bak_*` 有上一步的备份）：

```bash
PROD=/opt/tokenmp/versions.env
sed -i 's/^EXECUTOR_VERSION=.*/EXECUTOR_VERSION=<旧版本>/;s/^DASHBOARD_VERSION=.*/DASHBOARD_VERSION=<旧版本>/' "$PROD"
(cd /opt/tokenmp-dashboard && docker compose --env-file "$PROD" -f docker-compose.1panel.yml up -d --no-deps --no-build --force-recreate)
(cd /opt/tokenmp-executor  && docker compose --env-file "$PROD" -f docker-compose.yml         up -d --no-deps --no-build --force-recreate)
```

> **已应用的数据库迁移不回滚。** 这正是所有迁移必须向后兼容的原因。

### 服务器目录与账号

| 路径 | 用途 |
|---|---|
| `/opt/tokenmp/secrets.env` | 共享密钥（单一来源），两栈 compose 的 `env_file`（600） |
| `/opt/tokenmp/versions.env` | 正式栈镜像版本，compose `--env-file` 插值（600） |
| `/opt/tokenmp/versions-next.env` | 预览栈镜像版本（600） |
| `/opt/tokenmp/backups/` | 数据库备份（永不自动删除） |
| `/opt/tokenmp/last-promote.txt` | 最近一次上线记录 |
| `/opt/tokenmp-dashboard/`、`/opt/tokenmp-executor/` | 两个 git clone（含 `data/`、`data-next/` 运行时卷） |

- 部署账号 **`sumwai`**：在 `docker` 组、有 NOPASSWD sudo。
- 服务器拉取 GitHub：executor 走只读 Deploy Key，dashboard 为 public 匿名克隆。
- GitHub Secrets（两仓库同名）：`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`。
- **宿主机 Caddyfile 未纳入版本控制**，`next.` / `api.` 的映射规则不在本仓库内；
  自 2026-08 起部署流程**不再改动 Caddy**。

---

## 4. 数据库与迁移

**唯一源**：`executor/migrations/`（dashboard 不再单独发迁移）。

**目录结构 = 基线 + 增量**：

```
migrations/
├── 000001_identity.up.sql / .down.sql              身份 / 用户 / 系统配置
├── 000002_upstream.up.sql / .down.sql              供应商 / 模型 / 路由与倍率
├── 000003_billing_requests.up.sql / .down.sql      套餐 / 请求日志 / 配额账本 / 兑换码
├── 000004_marketplace_content.up.sql / .down.sql   市场分账 / 内容运营
└── 000005_*.up.sql                                 之后的新变更，一个改动一个文件
```

- `000001`~`000004` 是把历史 75 个增量迁移**压缩**而成的领域基线，共 38 张表。
  两组 schema **逐字节等价**（压缩时用 pg_dump 对比验证过）。
- **新增变更从 `000005` 起**，必须同时提供 `.up.sql` 与 `.down.sql`。
- **不要修改基线文件**；也不要再把新改动追加到基线里。

**执行**（`scripts/migrate.sh`，逐文件 `psql` autocommit，不包事务——历史迁移用过
`CREATE INDEX CONCURRENTLY`）：

```bash
DATABASE_URL=postgres://... bash scripts/migrate.sh                # 应用
DATABASE_URL=... bash scripts/migrate.sh --status                  # 进度 + 基线体检
DATABASE_URL=... bash scripts/migrate.sh --rebaseline              # 存量库一次性台账切换
```

**存量库首次运行是安全的**：`apply` 会先做基线体检——目标库 schema 若已完整等于基线
（38 张表 + 4 个最新标志列全部命中），就把 4 个基线文件**登记为已执行而不重跑**；
若处于「中间态」（既非空库、也非完整基线），直接**报错退出**，绝不静默假设。

三种环境都不需要人工干预：本机空库正常建表；预览/正式库已具备 schema，自动 adopt。

**不适用 golang-migrate** 的原因：台账形状 `schema_migrations(filename PK, applied_at)`
被 dashboard 的管理页只读复用。

---

## 5. 密钥

`/opt/tokenmp/secrets.env` 是**唯一来源**，被正式栈与预览栈共同引用：

| 变量 | 一致性要求 |
|---|---|
| `API_KEY_PEPPER` | ⚠️ **必须与历史值一致**——它参与 `sha256(pepper + rawKey)`，改动会让全部存量 API Key 失效 |
| `MASTER_ENCRYPTION_KEY` | ⚠️ **必须与历史值一致**——上游供应商密钥用它做 AES-256-GCM 加解密 |
| `JWT_SECRET` / `INTERNAL_API_TOKEN` / `PG_PASS` | 可轮换 |
| `DATABASE_URL` / `DATABASE_URL_NEXT` | 分别指向 `tokenmp` 与 `tokenmp_next` |

生成/补齐（幂等，已存在的键不改）：

```bash
PG_HOST=postgres bash /opt/tokenmp-dashboard/scripts/gen-secrets.sh
```

---

## 6. 排查

| 现象 | 排查 |
|---|---|
| dashboard 能登录，但用 API Key 调 executor 报鉴权失败 | 两容器的 `API_KEY_PEPPER` / `MASTER_ENCRYPTION_KEY` 不一致：`docker exec <svc> sh -c 'printf %s "$API_KEY_PEPPER"\|sha1sum'` 比对 |
| `v*` deploy 报 `git checkout` 冲突 | `/opt/tokenmp-*` 有未提交改动：`git -C /opt/tokenmp-<svc> reset --hard origin/main` |
| executor fetch `Permission denied` | Deploy Key 被删：重新加 `~/github-deploy-key/ed25519.pub` |
| Actions 连不上服务器 | 查 `DEPLOY_HOST/USER/KEY`、22 端口对 GitHub 开放、`authorized_keys` |
| executor `/healthz` 的 version 是 `dev` | build 漏了 `--build-arg VERSION=<tag>`（`deploy.yml` 已带） |
| `next` 或 `api` 域名 502 | 容器没起：`docker ps \| grep tokenmp-`，`docker logs tokenmp-executor` |
| `migrate.sh` 报「目标库处于中间态」 | 库既非空、也非完整基线。先查 `--status`，确认版本后再决定 `apply` 或 `--rebaseline` |
| `promote` 报「本地仓库没有 `<EV>`」 | 该版本还没发过预览栈：先推对应的 `v*` tag |
| `promote` 报镜像不存在 | 构建只发生在 `v*`；确认预览栈部署成功过 |

---

## 7. 版本与兼容性纪律

- **向后兼容改动**（加可选字段、新端点、加列）：单边打 tag 即可。
- **破坏性改动**：先发受影响方的兼容版本 → 再发另一边；或两边同步打 tag。
- **数据库迁移必须 expand-then-contract**：先加列（可空/有默认）→ 双写 → 切读 → 最后删旧。
  因为回滚只回镜像、不回 schema。
- `API_KEY_PEPPER` / `MASTER_ENCRYPTION_KEY` 永远只来自 `/opt/tokenmp/secrets.env`。

---

## 附：历史模型（已废弃，勿照做）

早期文档描述的是「**蓝绿双栈 + Caddy 开关切流**」：

- 蓝栈 = systemd 旧进程（`tokenmp-management` / `tokenmp-executor`），端口 8080 / 8081 / 3000，库 `tokenmp_prod`；
- 绿栈 = 本文档所述的两个容器，端口 18180 / 18181；
- 切流 = 改宿主机 Caddyfile 里 `(api_stack)` 的 `import legacy_stack` ⇄ `import newstack` 并 reload。

**该模型已不再适用**，请勿按旧文档操作：

- 现在的 18180 / 18181 **就是线上正式栈**（api.tokenmp.cn），不再有「绿栈待命」一说；
- 预览栈改由 **18280 / 18281 + `tokenmp_next` 库**承担；
- 上线与回滚**只改镜像版本号并重建容器**，部署流程完全不碰宿主机 Caddy；
- 蓝栈与 `tokenmp_prod` 库是待下线的历史遗留，**不应**再作为回滚手段。

> 若确认蓝栈已无用途，应另行执行下线：停 systemd 服务 → 归档 `tokenmp_prod` 库 →
> 清理 `/etc/caddy/Caddyfile` 中的 `legacy_stack`。该动作需用户明确发起。
