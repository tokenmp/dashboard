# AGENTS.md — TokenMP Dashboard 仓库协作规则

## Git 工作流（强制，无例外）

- **禁止直接推送到 `main` 分支。** GitHub 分支保护已开启（含管理员），直推会被拒绝。
- 一切改动的标准流程：
  1. 从最新 `main` 新建分支（`feat/xxx` / `fix/xxx` / `docs/xxx`）；
  2. 提交并推送到该分支；
  3. 创建 PR 到 `main`，等待 CI 全绿；
  4. **等待人工（仓库所有者）审查合并**，不得自行合并或绕过。
- PR 未合并前，不得基于「假设它已合并」开始后续工作。
- 分支推送后如果远端 `main` 有新提交，先 rebase 再更新 PR。

## Tag 与部署纪律

- `v*` tag：部署**预览栈**（next.tokenmp.cn，18280，库 `tokenmp_next`，见 `.github/workflows/deploy.yml`）。
  **只允许在用户明确要求发布时打**，且只能打在已合并进 `main` 的提交上。
- `prod-v*` tag（在 **executor 仓库**）：发布线上栈 api.tokenmp.cn，等同于生产变更，
  绝对需要用户明确发起。本仓库不打此类 tag。
- 打 tag 前确认 CI 在目标提交上是绿的。
- **迁移不在本仓库**：唯一源是 executor 仓库 `migrations/`，本仓库不再单独发迁移。

## 本仓库速览

- 技术栈：ThinkPHP 8 后端（`app/`）+ React/Vite 前端（`web/`）+ VitePress 文档站（`docs-site/`）。
- 路由集中在 `route/app.php`，前缀 `/api/v1`，分 `auth` / `site` / `panel` / `dashboard` 四个命名空间，
  与 `app/controller/` 下的目录一一对应。
- 测试：`composer test:unit`（本地跑集成测试需要 PG）；前端 `cd web && npm run lint && npm run build`。
- 部署契约（三套环境、迁移、密钥、回滚）见 **`docs/deployment.md`** —— 改动部署相关文件时必读。
- 后端约定与已知坑见 **`docs/backend-conventions.md`** —— 改控制器/查询前必读。
- 文档站改动的纪律见 `docs-site/README.md`：对外文案不引用内部实现细节（仓库路径/表列名/迁移号）。

## 沟通纪律

- 涉及生产（服务器、数据库、tag、GitHub Secrets）的操作，先说明计划再动手。
- 服务器为 `ssh tokenmp`。**正式栈**端口 18180（api.tokenmp.cn），
  **预览栈**端口 18280（next.tokenmp.cn）。
  历史蓝栈（systemd，8080/3000，库 `tokenmp_prod`）**已废弃、待下线**，不要把它当作回滚手段。
- 宿主机 Caddyfile **不在版本控制内**，且自 2026-08 起部署流程不再改动它；
  如需改动需用户明确发起。
