# ![](/logos/opencode.ico) OpenCode

开源 AI 编程 Agent / CLI（[官方网站](https://opencode.ai) · [文档](https://opencode.ai/docs)）。
OpenCode 通过 `opencode.json` 的 `provider` 配置接入任意 OpenAI / Anthropic 兼容网关。

## 安装

::: code-group

```bash [npm]
npm install -g opencode-ai
```

```bash [官方脚本]
curl -fsSL https://opencode.ai/install | bash
```

:::

安装后运行 `opencode --version` 确认（本站实测版本 1.18.18）。
## 接入 OpenAI 兼容端点（推荐）

项目根或全局目录放 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "tokenmp": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "TokenMP",
      "options": {
        "baseURL": "https://api.tokenmp.cn/v1",
        "apiKey": "{env:TOKENMP_API_KEY}"
      },
      "models": {
        "mimo-v2.5": {
          "name": "MiMo v2.5",
          "limit": { "context": 200000, "output": 65536 }
        }
      }
    }
  }
}
```

```bash
export TOKENMP_API_KEY=sk-你的APIKey
opencode run -m tokenmp/mimo-v2.5 "hello"
```

要点：

- `npm` 用 `@ai-sdk/openai-compatible` 走 `/v1/chat/completions`；模型较多时也可用 `@ai-sdk/openai` 走 `/v1/responses`，甚至按模型混用。
- `baseURL` 必须带 `/v1` 后缀。
- `models` 的键必须是网关 `GET /v1/models` 返回的模型 ID（可用[模型选择器](/api/chat-completions#模型选择器)语法，如 `"mimo-v2.5:premium"`）。
- API Key 建议 `{env:VAR}` 环境变量注入（也支持 `{file:路径}`），避免明文进 git。
- 自定义 provider 的 `limit.context/output` 不会自动获取，显式设置可避免上下文估算错误。

## 接入 Anthropic 兼容端点

覆盖内置 `anthropic` provider 的 `baseURL`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "https://api.tokenmp.cn/v1",
        "apiKey": "{env:TOKENMP_API_KEY}"
      },
      "whitelist": ["mimo-v2.5"]
    }
  }
}
```

## 验证与常见问题

- TUI 内 `/models` 选择 `tokenmp/mimo-v2.5` 后发消息，或直接 `opencode run -m ...`。
- API Key 用 `options.apiKey: "{env:VAR}"` 注入时**无需 `/connect`**，实测直接可用；仅当完全不写 apiKey 时才需要 `/connect` → Other → 输入与配置键一致的 provider ID → 粘贴 Key。
- 推理模型输出在 `reasoning_content` 字段时，给模型加 `"reasoning": true` 和 `"interleaved": {"field": "reasoning_content"}`。

## 实测记录

2026-08-15 · Linux x64 · Node v24.19.0 · OpenCode **1.18.18**（`npm i -g opencode-ai`）· 模型 `mimo-v2.5`

```bash
export TOKENMP_API_KEY=sk-***
opencode run -m tokenmp/mimo-v2.5 "只回复两个字：收到"
# 输出：
# > build · mimo-v2.5
# 收到
```

配置即上文「接入 OpenAI 兼容端点」的原文（`@ai-sdk/openai-compatible` + `{env:TOKENMP_API_KEY}`），未经修改。

## 信息来源

- 官方文档：[OpenCode Providers](https://opencode.ai/docs/providers/)
- 本站实测：2026-08-15，OpenCode 1.18.18 / Node v24.19.0（见上文「实测记录」）
