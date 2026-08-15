# ![](/logos/hermes.ico) Hermes Agent

支持工具调用的 AI 助手，可桌面端或 Docker 网关部署（本站经 1Panel 应用商店部署，镜像 `1panel/hermes-agent`）。

内置 `custom` provider 直接对接 OpenAI 兼容网关，1Panel 应用商店的 hermes-agent 镜像即以此方式接入 TokenMP。

## 安装

::: code-group

```bash [Docker]
docker run -d --name hermes-agent \
  -p 9119:9119 \
  -v /opt/hermes-data:/opt/data \
  1panel/hermes-agent:2026.8.3
```

```text [1Panel]
应用商店 → 搜索 hermes-agent → 安装（数据目录默认挂载 /opt/data）
```

:::

本站实测版本 v0.20.0（镜像 2026.8.3）。
## 配置

数据目录下的 `config.yaml`：

```yaml
model:
    provider: custom
    base_url: https://api.tokenmp.cn/v1
    api_key: ${CUSTOM_API_KEY}     # 支持环境变量替换，从 .env 读取
    default: mimo-v2.5
```

`.env`（与 config.yaml 同目录）：

```bash
CUSTOM_API_KEY=sk-你的APIKey
```

Docker 部署时把数据目录挂载出来（1Panel 版挂载到 `/opt/data`，宿主路径如 `/opt/1panel/apps/hermes-agent/Hermes-Agent/data`），改完配置重启容器生效。

## 命令行方式

不手改文件也可以：

```bash
hermes setup          # 交互式向导（选 custom provider，填 base_url / key / 默认模型）
hermes model          # 切换默认模型与 provider
hermes fallback       # 配置备用 provider（主模型失败时按序尝试）
hermes status         # 查看当前生效配置
```

## 验证

```bash
hermes -z "你好" -m mimo-v2.5
```

返回回复即接入成功。

## 实测记录

2026-08-15 · Docker（1Panel hermes-agent 镜像 2026.8.3）· Hermes Agent **v0.20.0** · Python 3.13.5 · OpenAI SDK 2.24.0 · 模型 `mimo-v2.5`

生产实例即用上文 `config.yaml` 原文配置（`provider: custom` + `https://api.tokenmp.cn/v1`）：

```bash
hermes -z "只回复两个字：收到" -m mimo-v2.5
# 输出：收到
```

## 常见问题

- `api_key` 支持 `${VAR}` 环境变量替换（读同目录 `.env`），比明文安全。
- 模型名以网关 `GET /v1/models` 返回为准，填错表现为 404 / model not found。
- 用 `hermes fallback` 可以把 TokenMP 的[模型选择器](/api/chat-completions#模型选择器)语法（`mimo-v2.5:premium`）配成多个备用档位。

## 信息来源

- 本站实测：2026-08-15，Hermes Agent v0.20.0（1Panel hermes-agent 镜像 2026.8.3，生产实例原配置）
- 配置字段依据：本机实例 `config.yaml` + `hermes --help` 命令说明
