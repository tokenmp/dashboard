# TokenMP 部署手册（蓝绿）

生产部署总览。**dashboard**(ThinkPHP+React)与 **executor**(Go)容器化跑在 tokenmp 服务器(45.144.138.23)上,
共用 PostgreSQL(`postgres` 容器内的 `tokenmp` 库)。

> 本文件是两仓库共同的部署契约。executor 仓库 README 指向此处。

## 架构：蓝绿双栈

```
外网 → Caddy(host, :80/:443, TLS)
        ├─ next.tokenmp.cn ──── import newstack ──→ 绿栈(新, 容器)
        │                                            ├─ /api/v1/* & SPA → 127.0.0.1:18180 → tokenmp-dashboard(FrankenPHP)
        │                                            └─ /v1/*          → 127.0.0.1:18181 → tokenmp-executor(Go)
        └─ api.tokenmp.cn ──── import api_stack ──┐
              (api_stack 内一行开关:              ├─ legacy_stack(蓝, systemd 旧栈) 8080/8081/3000, 库 tokenmp_prod
               import legacy_stack ⇄ newstack)    └─ newstack(绿, 同上)

数据库: postgres:17 容器 → 绿栈用 tokenmp 库；蓝栈用 tokenmp_prod 库(切流后原样保留)
```

- **蓝栈** = 现 systemd 旧进程(`tokenmp-management`/`tokenmp-executor` + next web)，
  承接 api.tokenmp.cn 的正式流量，**切流前不动**，是回滚兜底。
- **绿栈** = 本仓库+executor 仓库构建的两个容器，常驻 next.tokenmp.cn 后面。
- **蓝绿切换 = 改 Caddy 开关行 + reload**，秒级、不断连接。

## 服务器实际目录

| 路径 | 用途 |
|---|---|
| `/opt/tokenmp/secrets.env` | 共享密钥(单一来源), 两 compose 的 `env_file` 引用 (600) |
| `/opt/tokenmp/versions.env` | 镜像版本号, compose `--env-file` 插值 image tag (600) |
| `/opt/tokenmp/backups/` | 切流前全量 pg_dump 备份, 永不自动删除 |
| `/opt/tokenmp/last-promote.txt` | 最近一次切流的 tag/时间/备份位置 |
| `/opt/tokenmp-dashboard/` | dashboard git clone(含 `data/` 运行时卷) |
| `/opt/tokenmp-executor/` | executor git clone |

部署账号 **`sumwai`**: docker 组(免 sudo 用 docker)、NOPASSWD sudo(Caddy reload 用)。
服务器拉取 GitHub: executor 走只读 Deploy Key(`~/github-deploy-key/`, 已加到两仓库);
dashboard 为 public, https 匿名克隆。

## 两个 env 文件, 别混淆

| 文件 | compose 用法 | 作用 |
|---|---|---|
| `secrets.env` | `env_file:`(compose 字段) | 注入**容器内**环境(JWT_SECRET/PEPPER/MASTER_KEY/INTERNAL_API_TOKEN/PG_PASS/DATABASE_URL) |
| `versions.env` | `--env-file`(CLI 参数) | **compose 插值** `${DASHBOARD_VERSION}`/`${EXECUTOR_VERSION}` → image tag |

密钥来源约定:
- `API_KEY_PEPPER`/`MASTER_ENCRYPTION_KEY` **沿用蓝栈旧值**(自 `/www/wwwroot/tokenmp/shared/.env`),
  保证存量用户 API Key 与上游账号加密在新栈继续可用;
- 其余(JWT_SECRET/INTERNAL_API_TOKEN/PG_PASS)为绿栈新生成。

## 日常部署: 打 v* tag

```bash
cd /workspace/dashboard && git tag v1.2.0 && git push origin v1.2.0   # 只更新 dashboard
cd /workspace/executor  && git tag v1.0.4 && git push origin v1.0.4   # 只更新 executor(含迁移)
```

GitHub 收到 `v*` tag → 托管 runner SSH 进服务器执行:
`git fetch/checkout $TAG → docker build → (executor: scripts/migrate.sh) → 写 versions.env →
compose up --force-recreate → 冒烟(next 域名/本地端口) → healthz 校验(executor)`。
**只更新被打 tag 的那个服务**, 另一个不动。当前版本:`cat /opt/tokenmp/versions.env`。

部署结果只在 next.tokenmp.cn 可见, api.tokenmp.cn 不受影响。

## 切流(蓝→绿): 打 prod-v* tag(人工确认动作)

```bash
cd /workspace/executor && git tag prod-v1.0.0 && git push origin prod-v1.0.0
```

触发 executor 仓库 `promote.yml`, 在服务器上依次:
1. 前置检查绿栈健康(healthz + site API);
2. `pg_dump -Fd -j4` **全量备份 tokenmp_prod** 到 `/opt/tokenmp/backups/`(满足「备份保留数据」);
3. 备份 Caddyfile 后把 `(api_stack)` 内开关行 `import legacy_stack` 改为 `import newstack`,
   `caddy validate` + `systemctl reload caddy`;
4. 冒烟 `https://api.tokenmp.cn/` 与 `/api/v1/site/overview`, **失败自动回滚**开关行。

## 回滚

```bash
# 切流后发现异常: 一条命令回蓝(秒级)
sudo sed -i -E 's/^([[:space:]]*)import newstack[[:space:]]*$/\1import legacy_stack/' /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 绿栈自身要回旧版: 改回 versions.env 再重建(旧 tag 镜像若已清理需先 build)
sed -i 's/^EXECUTOR_VERSION=.*/EXECUTOR_VERSION=v1.0.3/' /opt/tokenmp/versions.env
docker compose --env-file /opt/tokenmp/versions.env -f /opt/tokenmp-executor/docker-compose.yml up -d --force-recreate
sed -i 's/^DASHBOARD_VERSION=.*/DASHBOARD_VERSION=v1.1.9/' /opt/tokenmp/versions.env
docker compose --env-file /opt/tokenmp/versions.env -f /opt/tokenmp-dashboard/docker-compose.1panel.yml up -d --force-recreate
```

蓝栈 systemd 服务与 tokenmp_prod 库切流后**原样保留**, 直到人工确认下线。

## 版本与兼容性纪律

- **向后兼容改动**(加可选字段、新端点、加列):单边打 tag 即可。
- **破坏性改动**:先发受影响方的兼容版 → 再发另一边;或两边同步打 tag。
- **DB 迁移走 expand-then-contract**, 唯一源在 executor 仓库 `migrations/`，
  executor 的 deploy 流程会在重建容器前自动执行 `scripts/migrate.sh`。
- `API_KEY_PEPPER`、`MASTER_ENCRYPTION_KEY` 永远只来自 `/opt/tokenmp/secrets.env`, 两边一致。

executor `/healthz` 返回 `version`, 可与 `versions.env` 交叉核对。

## 数据迁移状态(2026-08-15)

绿栈 `tokenmp` 库已从 `tokenmp_prod` 完成迁移(75 版迁移 + 27 张表按列交集导入):
用户/套餐/密钥/上游/模型/路由/兑换码/公告等业务表已就位(含 users 258、user_plans 274、
user_api_keys 1029、plans 15)。

**尚未迁移的大表**(等确认后再补, 蓝栈库中数据完整保留):
`request_logs` / `request_attempts` / `request_log_events` / `usage_ledger` /
`quota_reservations` / `key_leases` / `marketplace_ledger` / `marketplace_request_settlements` 及全部归档表。
历史请求/账单在新栈暂为空, 用户「用量统计」自切流时刻起重新累计。

## 密钥轮换

```bash
# ⚠️ 轮换会使现有 API key 失效, 仅在必要时执行
bash /opt/tokenmp-dashboard/scripts/gen-secrets.sh   # 幂等, 默认不改已存在值(注意 PG_HOST 默认值需覆盖为 postgres)
# 要强制轮换某个: 先编辑 secrets.env 删掉那行, 再跑上面命令补生成
docker compose --env-file /opt/tokenmp/versions.env -f /opt/tokenmp-dashboard/docker-compose.1panel.yml up -d --force-recreate
docker compose --env-file /opt/tokenmp/versions.env -f /opt/tokenmp-executor/docker-compose.yml up -d --force-recreate
```

## 排查

| 现象 | 排查 |
|---|---|
| dashboard 能登录但 API Key 调 executor 报鉴权失败 | `API_KEY_PEPPER`/`MASTER_ENCRYPTION_KEY` 不一致;`docker exec <svc> sh -c 'printf %s "$API_KEY_PEPPER"\|sha1sum'` 比对两边 |
| deploy 报 `git checkout` 冲突 | `/opt/tokenmp-*` 有未提交改动;`git -C /opt/tokenmp-<svc> reset --hard origin/main` |
| executor fetch `Permission denied` | deploy key 未加或被删;重新加 `~/github-deploy-key/ed25519.pub` |
| Actions 连不上服务器 | 检查 `DEPLOY_HOST/USER/KEY`、服务器 22 端口对 GitHub 开放、`authorized_keys` |
| executor `/healthz` version 是 `dev` | build 漏了 `--build-arg VERSION=<tag>`(已在 deploy.yml) |
| next 域名 502 | 绿栈容器没起:`docker ps | grep tokenmp-`, 看 `docker logs tokenmp-executor` |
