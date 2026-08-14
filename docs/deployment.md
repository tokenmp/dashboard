# TokenMP 部署手册

生产部署总览。**dashboard**(ThinkPHP+React)与 **executor**(Go)跑在同一台 1Panel 服务器上,共用一个 PostgreSQL。两仓库各自打 `v*` 标签触发部署。

> 本文件是两仓库共同的部署契约。executor 仓库 README 指向此处。

## 架构

```
外网 → OpenResty(1Panel, host 网络, HTTPS)
          ├─ dashboard  → 127.0.0.1:8088 → tokenmp-dashboard(FrankenPHP)
          └─ /v1/*      → 127.0.0.1:9000 → executor(Go)
                                        │ (1panel-network)
                                        └─ 1Panel-postgresql-eyuK(库 tokenmp)

CD: GitHub 托管 runner(ubuntu-latest)──SSH──► 本服务器(tokenmp-deploy 用户)
       推 v* tag 触发: git fetch tag → docker build → 写 versions.env → compose up
```

两个容器只绑 `127.0.0.1`,不对外,由同机 OpenResty 反代。**不在服务器跑 self-hosted runner**;GitHub 托管 runner 通过 SSH 连入执行部署。

## 服务器实际目录(已配置)

| 路径 | 用途 | 拥有 |
|---|---|---|
| `/opt/tokenmp/secrets.env` | 共享密钥(单一来源),两 compose 的 `env_file` 引用 | tokenmp-deploy 600 |
| `/opt/tokenmp/versions.env` | 镜像版本号,compose `--env-file` 插值 image tag | tokenmp-deploy 600 |
| `/opt/tokenmp/secrets.env` 生成脚本 | `scripts/gen-secrets.sh`(两仓库各一份) | — |
| `/opt/tokenmp-dashboard/` | dashboard git clone(含 `data/` 运行时卷) | tokenmp-deploy |
| `/opt/tokenmp-executor/` | executor git clone | tokenmp-deploy |
| `/home/tokenmp-deploy/.ssh/` | 部署账号 SSH 密钥(登录 + github fetch) | tokenmp-deploy 600 |
| `/opt/tokenmp/deploy-secrets.txt` | 一次性部署密钥与 GitHub 配置指引(机密) | tokenmp-deploy 600 |

部署账号 **`tokenmp-deploy`**:无 sudo、在 `docker` 组(免 sudo 用 docker)、拥有 `/opt/tokenmp*`。

## 两个 env 文件,别混淆

| 文件 | compose 用法 | 作用 |
|---|---|---|
| `secrets.env` | `env_file:`(compose 字段) | 注入**容器内**环境(JWT_SECRET/PEPPER/MASTER_KEY/INTERNAL_API_TOKEN/PG_PASS/DATABASE_URL) |
| `versions.env` | `--env-file`(CLI 参数) | **compose 插值** `${DASHBOARD_VERSION}`/`${EXECUTOR_VERSION}` → image tag |

## 日常部署:打 tag

```bash
cd /workspace/dashboard && git tag v1.2.0 && git push origin v1.2.0   # 只更新 dashboard
cd /workspace/executor  && git tag v1.0.4 && git push origin v1.0.4   # 只更新 executor
```

GitHub 收到 `v*` tag → 托管 runner 跑 `deploy.yml` → SSH 进服务器执行:
`git fetch/checkout $TAG → docker build -t <svc>:$TAG → 写 versions.env → compose --env-file up --force-recreate → healthz 校验`。

**只更新被打 tag 的那个服务**,另一个不动。当前版本:`cat /opt/tokenmp/versions.env`。

## ⚠️ 首次启用 CD 前,你必须完成的步骤

服务器侧我已就绪,以下三项需你在 GitHub 完成(密钥值见 `/opt/tokenmp/deploy-secrets.txt`):

1. **提交本批改动到两个仓库 main 分支**
   - 改动含新的 `docker-compose*.yml`(env_file + `${VERSION}`)、`deploy.yml`、`gen-secrets.sh`、executor `healthz` version 等。
   - **必须先提交**,否则 `/opt` 里的 compose 是 dirty 状态、deploy 的 `git checkout` 会冲突,且 tag 里不含这些改动。
2. **加 executor Deploy Key**(executor 是 private 仓库)
   - 公钥见 `deploy-secrets.txt` [2],加到 `github.com/tokenmp/executor → Settings → Deploy keys`(只读即可)。
   - dashboard 是 public,https 可拉;若 https 间歇失败,也可给它加同一 deploy key 并把 remote 改 SSH。
3. **填 GitHub Secrets**(两个仓库都要)
   - `DEPLOY_HOST` = 服务器公网 IP/域名
   - `DEPLOY_USER` = `tokenmp-deploy`
   - `DEPLOY_SSH_KEY` = `deploy-secrets.txt` [1] 的私钥(含 `-----BEGIN/END-----`)

完成后推一个测试 tag(如 `v0.0.1-test`)验证闭环。

## 回滚

```bash
sudo sed -i 's/^DASHBOARD_VERSION=.*/DASHBOARD_VERSION=v1.1.9/' /opt/tokenmp/versions.env
sudo docker compose --env-file /opt/tokenmp/versions.env \
  -f /opt/tokenmp-dashboard/docker-compose.1panel.yml up -d --no-deps --force-recreate
# (旧 tag 镜像若已清理,先 docker build -t tokenmp-dashboard:v1.1.9 .)
```

## 版本与兼容性纪律

- **向后兼容改动**(加可选字段、新端点、加列):单边打 tag 即可。
- **破坏性改动**(删/改字段类型、改 API 契约、破坏性 schema):先发受影响方的兼容版 → 再发另一边;或两边同步打 tag。
- **DB 迁移走 expand-then-contract**:先加新列(兼容旧码)→ 部署 → 再删旧列。迁移唯一源在 executor 仓库 `migrations/`(2026-08-14 起,原 dashboard `db/migrations` 已并入其 `000055`–`000069`),按 `psql` 字典序执行,天然支持分步。
- `API_KEY_PEPPER`、`MASTER_ENCRYPTION_KEY` 永远只来自 `/opt/tokenmp/secrets.env`,两边一致。

executor `/healthz` 返回 `version`,可与 `versions.env` 交叉核对。

## 密钥轮换

```bash
# ⚠️ 轮换会使现有 API key 失效,仅在必要时执行
sudo -u tokenmp-deploy bash /opt/tokenmp-dashboard/scripts/gen-secrets.sh   # 幂等,默认不改已存在值
# 要强制轮换某个: 先编辑 secrets.env 删掉那行, 再跑上面命令补生成
sudo docker compose --env-file /opt/tokenmp/versions.env -f /opt/tokenmp-dashboard/docker-compose.1panel.yml up -d --force-recreate
sudo docker compose --env-file /opt/tokenmp/versions.env -f /opt/tokenmp-executor/docker-compose.yml up -d --force-recreate
```

## 排查

| 现象 | 排查 |
|---|---|
| dashboard 能登录但 API Key 调 executor 报鉴权失败 | `API_KEY_PEPPER`/`MASTER_ENCRYPTION_KEY` 不一致;`docker exec <svc> sh -c 'printf %s "$API_KEY_PEPPER"\|sha1sum'` 比对两边 |
| deploy 报 `git checkout` 冲突 | `/opt/tokenmp-*` 有未提交改动;`git -C /opt/tokenmp-<svc> reset --hard origin/main` |
| executor fetch `Permission denied` | deploy key 未加或被删;重新加公钥B |
| Actions 连不上服务器 | 检查 `DEPLOY_HOST/USER/KEY`、服务器 22 端口对 GitHub 开放、`authorized_keys` |
| executor `/healthz` version 是 `dev` | build 漏了 `--build-arg VERSION=<tag>`(已在 deploy.yml) |
