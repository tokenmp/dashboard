# ![](/logos/openclaw.jpg) OpenClaw

开源自托管个人 AI Agent 平台，原 Clawdbot / Moltbot（[官方网站](https://openclaw.ai) · [文档](https://docs.openclaw.ai) · [GitHub](https://github.com/openclaw/openclaw)）。
开源自托管个人 AI Agent 平台（原 Clawdbot / Moltbot），可经 WhatsApp / Telegram 等渠道驱动。支持 OpenAI 与 Anthropic 两种兼容协议，配置文件为 `~/.openclaw/openclaw.json`（JSON5 语法）。

## 安装

::: code-group

```bash [npm]
npm install -g openclaw
```

```bash [官方脚本]
curl -fsSL https://openclaw.ai/install.sh | bash
```

:::

安装后运行 `openclaw --version` 确认（本站实测版本 2026.7.1-2）。
## 接入 OpenAI 兼容端点

```json5
{
  agents: {
    defaults: { model: { primary: "tokenmp/mimo-v2.5" } }   // provider-id/model-id
  },
  models: {
    providers: {
      tokenmp: {
        baseUrl: "https://api.tokenmp.cn/v1",
        apiKey: "${TOKENMP_API_KEY}",
        api: "openai-completions",
        timeoutSeconds: 300,
        models: [
          {
            id: "mimo-v2.5",
            name: "MiMo v2.5",
            contextWindow: 200000,
            maxTokens: 8192
          }
        ]
      }
    }
  }
}
```

## 接入 Anthropic 兼容端点

把 `api` 换成 `"anthropic-messages"`，`baseUrl` 填 `https://api.tokenmp.cn`：

```json5
models: {
  providers: {
    tokenmp: {
      baseUrl: "https://api.tokenmp.cn",
      apiKey: "${TOKENMP_API_KEY}",
      api: "anthropic-messages",
      models: [{ id: "mimo-v2.5", name: "MiMo v2.5" }]
    }
  }
}
```

## 设置默认模型

添加 provider 后**不会自动切换**，两种方式任选：

```bash
openclaw models set tokenmp/mimo-v2.5
```

或在 `agents.defaults.model.primary` 里直接写 `tokenmp/mimo-v2.5`（见上）。

## 验证与常见问题

```bash
openclaw models list          # 应列出 tokenmp/mimo-v2.5 且 Auth 列为 yes
openclaw chat --local --message "你好"   # 本地会话直接对话（不经过消息网关）
```

- `models[]` 省略字段的默认值：contextWindow 200000、maxTokens 8192——与实际模型不符时显式声明。
- agent 级已存在的 `baseUrl` 或明文 key 会覆盖新配置（配置 merge 行为），自定义端点不生效时检查 agent 级配置。
- 非原生 OpenAI 端点会强制禁用 `developer` role 并跳过 OpenAI 专属参数，属预期兼容行为。
- API Key 用 `${VAR}` 环境变量替换比明文安全。
- `openclaw agent --message` 走消息网关，未配置 gateway 凭证会报 `GatewayCredentialsRequiredError`——日常测试用 `openclaw chat --local` 即可。

## 实测记录

2026-08-15 · Linux x64 · Node v24.19.0 · OpenClaw **2026.7.1-2**（`npm i -g openclaw`）· 模型 `mimo-v2.5`

配置即上文「接入 OpenAI 兼容端点」的原文（`api: "openai-completions"` + `${TOKENMP_API_KEY}`），未经修改。

```bash
export TOKENMP_API_KEY=sk-***
openclaw models list
# Model                    Input  Ctx   Local Auth Tags
# tokenmp/mimo-v2.5        text   200k  no    yes   default

openclaw chat --local --message "只回复两个字：收到"
# 会话回复：收到
# 状态栏：agent main | session main | tokenmp/mimo-v2.5 | tokens 19k/200k (9%)
```

默认模型生效的前提是 `agents.defaults.model.primary` 设为 `tokenmp/mimo-v2.5`（或 `openclaw models set`）。

## 信息来源

- 官方文档：[Model Providers](https://docs.openclaw.ai/concepts/model-providers)、[Models](https://docs.openclaw.ai/concepts/models)、[OpenAI Provider](https://docs.openclaw.ai/providers/openai)
- 已知问题：[openclaw/openclaw#2903](https://github.com/openclaw/openclaw/issues/2903)（baseUrl 不透传，已修复版本）
- 本站实测：2026-08-15，OpenClaw 2026.7.1-2 / Node v24.19.0（见上文「实测记录」）
