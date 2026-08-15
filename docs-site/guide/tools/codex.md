# ![](/logos/codex.png) Codex CLI

OpenAI 官方 AI 编程 CLI（[官方网站](https://openai.com/codex) · [GitHub](https://github.com/openai/codex)）。
OpenAI 官方 Codex CLI 通过 `~/.codex/config.toml` 接入自定义网关。

::: warning 协议要求
当前版本 Codex **只支持 OpenAI Responses 协议**（`wire_api = "responses"` 是唯一取值）。TokenMP 网关已实现 `/v1/responses`，可直接使用；网上旧教程的 `wire_api = "chat"` 写法已失效，**仅支持 `/v1/chat/completions` 的网关无法接入**。
:::

## 安装

::: code-group

```bash [npm]
npm install -g @openai/codex
```

```bash [Homebrew]
brew install codex
```

:::

安装后运行 `codex --version` 确认（本站实测版本 codex-cli 0.147.0）。
## 配置

`~/.codex/config.toml`（必须用户级目录；**项目级 `.codex/config.toml` 会忽略 provider 相关键**）：

```toml
model = "mimo-v2.5"            # 网关侧模型名
model_provider = "tokenmp"

[model_providers.tokenmp]
name = "TokenMP"
base_url = "https://api.tokenmp.cn/v1"   # Codex 在其后拼 /responses
env_key = "TOKENMP_API_KEY"              # 环境变量名（不是 key 值），以 Bearer 发送
```

```bash
export TOKENMP_API_KEY=sk-你的APIKey
codex
```

::: tip
注意 `openai`、`ollama`、`lmstudio` 是保留 provider ID，不可覆盖——所以务必像上面这样新建自定义 provider。
:::

## 多套配置（profile）

Profile 机制已改为**独立配置文件**：把上面整套配置写到 `~/.codex/tokenmp.config.toml`（顶层键，不嵌套），然后：

```bash
codex --profile tokenmp
```

旧版 `[profiles.<name>]` 写法在 0.134.0+ 已失效。

## 验证与常见问题

```bash
TOKENMP_API_KEY=sk-xxx codex exec --profile tokenmp --skip-git-repo-check "reply with OK"
```

TUI 内 `/status` 查看当前 provider / model。

- `codex exec` 在非 git 目录会被拒绝，加 `--skip-git-repo-check` 或在 git 仓库内运行。
- `env_key` 填的是**环境变量名**；未 export 时启动报错。
- `model` 必须是网关认识的模型名；上下文窗口不准时用 `model_context_window` 修正。
- 网关要求 `x-api-key` 头时（TokenMP 不需要，Bearer 即可），用 `http_headers = { "x-api-key" = "..." }` 替代 `env_key`。
- 单次临时覆盖：`codex -c model_provider='"tokenmp"' -c model='"mimo-v2.5"' "hello"`（`-c` 值按 TOML 解析，注意引号）。

## 实测记录

2026-08-15 · Linux x64 · Node v24.19.0 · Codex CLI **0.147.0**（`npm i -g @openai/codex`）· 模型 `mimo-v2.5`

配置即上文「多套配置」原文，写入 `~/.codex/tokenmp.config.toml` 后：

```bash
export TOKENMP_API_KEY=sk-***
codex exec --profile tokenmp --skip-git-repo-check "只回复两个字：收到" </dev/null
# 输出（节选）：
# codex
# 收到
```

确认要点：

- 请求走 `POST https://api.tokenmp.cn/v1/responses`（Responses 协议），TokenMP 网关原生支持。
- 自定义模型名会出现 `warning: Model metadata for 'mimo-v2.5' not found. Defaulting to fallback metadata` 提示，不影响使用。
- `/v1/responses` 端点会原样透传参数（见 [Responses API](/api/responses)），工具调用正常。

## 信息来源

- 官方文档：[Codex Config Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、[Config Advanced（model_providers）](https://learn.chatgpt.com/docs/config-file/config-advanced)、[GitHub openai/codex](https://github.com/openai/codex)
- 本站实测：2026-08-15，Codex CLI 0.147.0 / Node v24.19.0（见上文「实测记录」）
