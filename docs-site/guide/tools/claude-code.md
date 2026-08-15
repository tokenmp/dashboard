# ![](/logos/claude.svg) Claude Code

Anthropic 官方 AI 编程 CLI（[官方网站](https://claude.ai/claude-code) · [文档](https://code.claude.com/docs)）。
Claude Code 通过环境变量指向任意 **Anthropic Messages 兼容**网关，TokenMP 的 `/v1/messages` 端点可直接使用。

## 安装

::: code-group

```bash [npm]
npm install -g @anthropic-ai/claude-code
```

```bash [官方脚本]
curl -fsSL https://claude.ai/install.sh | bash
```

:::

安装后运行 `claude --version` 确认（本站实测版本 2.1.233）。
## 快速接入（shell）

```bash
export ANTHROPIC_BASE_URL=https://api.tokenmp.cn
export ANTHROPIC_AUTH_TOKEN=sk-你的APIKey
claude
```

- `ANTHROPIC_BASE_URL` **不带** `/v1` 后缀，Claude Code 自动拼接 `/v1/messages`。
- 鉴权两个变量任选：`ANTHROPIC_AUTH_TOKEN` 发送 `Authorization: Bearer`（推荐先用这个）；`ANTHROPIC_API_KEY` 发送 `x-api-key`。TokenMP 两种都支持。
- 没有类似 `--base-url` 的命令行参数，只能用环境变量或 settings 文件。

## 持久化（settings.json）

`~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.tokenmp.cn",
    "ANTHROPIC_AUTH_TOKEN": "sk-你的APIKey"
  },
  "model": "mimo-v2.5"
}
```

项目级配置放 `.claude/settings.local.json`，**不要把 Key 写进会被 git 提交的 `.claude/settings.json`**。

## 模型设置

优先级：会话内 `/model` > 启动参数 `claude --model` > 环境变量 `ANTHROPIC_MODEL` > settings 的 `model` 字段。

网关模式下模型名**不做本地校验、直接透传**，填 TokenMP 模型列表里的名字即可。网关模型不在内置列表时，设置环境变量开启模型发现（启动时从网关 `/v1/models` 拉取）：

```bash
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

## 验证

```bash
curl https://api.tokenmp.cn/v1/messages \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"mimo-v2.5","max_tokens":1,"messages":[{"role":"user","content":"."}]}'
```

返回 `{"id":"msg_...","content":[...]}` 即接入成功（即使报模型不存在，也说明地址与凭证已生效）。CLI 内 `/status` 应显示 `Anthropic base URL` 行。

## 实测记录

2026-08-15 · Linux x64 · Node v24.19.0 · Claude Code **2.1.233** · 模型 `mimo-v2.5`

```bash
export ANTHROPIC_BASE_URL=https://api.tokenmp.cn
export ANTHROPIC_AUTH_TOKEN=sk-***
claude -p "只回复两个字：收到" --model mimo-v2.5
# 输出：收到
```

首次使用网关模型会出现以下提示（不影响使用，模型名会直接透传给网关）：

```
"mimo-v2.5" is not a model this version of Claude Code recognizes, so auto-compact
will keep this session within 200k tokens (the context window it assumes). ...
to make it recognized, map it in the modelOverrides setting or update Claude Code;
CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 restores the previous ...
```

消除方式任选：`modelOverrides` 设置里映射模型、`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 设真实窗口、或按提示关闭强校验。

## 常见问题

- **401**：凭证放错变量，`ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 换着试。
- 后台 agent / 守护进程读不到 shell export 的变量——写进 settings 文件的 `env` 块。
- 上下文窗口显示不准：`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 修正；上下文超限自动压缩阈值用 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`。
- 网关激活期间依赖 claude.ai 身份的功能（Remote Control、语音听写）不可用，属预期行为。

## 信息来源

- 官方文档：[Connect Claude Code to an LLM gateway](https://code.claude.com/docs/en/llm-gateway-connect)、[Model configuration](https://code.claude.com/docs/en/model-config)
- 本站实测：2026-08-15，Claude Code 2.1.233 / Node v24.19.0（见上文「实测记录」）
