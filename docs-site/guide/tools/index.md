# 工具接入

TokenMP 网关同时提供 **OpenAI 兼容**（`/v1/chat/completions`、`/v1/responses`）与 **Anthropic 兼容**（`/v1/messages`）端点，绝大多数 AI 编程工具与 Agent 无需改造即可接入。

## 支持矩阵

| 工具 | 接入协议 | 配置方式 | 实测 | 文档 |
| --- | --- | --- | --- | --- |
| Claude Code | Anthropic Messages | 环境变量 / settings.json | ✅ v2.1.233 | [Claude Code](/guide/tools/claude-code) |
| OpenCode | OpenAI Chat / Responses / Anthropic | opencode.json | ✅ v1.18.18 | [OpenCode](/guide/tools/opencode) |
| Codex CLI | OpenAI Responses | ~/.codex/config.toml | ✅ v0.147.0 | [Codex CLI](/guide/tools/codex) |
| Trae | OpenAI Chat / Anthropic | 图形界面 | 未实测（GUI） | [Trae](/guide/tools/trae) |
| WorkBuddy | OpenAI Chat | 图形界面 | 未实测（GUI） | [WorkBuddy](/guide/tools/workbuddy) |
| OpenClaw | OpenAI Chat / Anthropic | openclaw.json | ✅ 2026.7.1-2 | [OpenClaw](/guide/tools/openclaw) |
| Hermes Agent | OpenAI Chat | config.yaml | ✅ v0.20.0 | [Hermes](/guide/tools/hermes) |

标注 ✅ 的页面含实测环境、版本与真实输出；GUI 工具页内容来自官方文档与社区调研。

Cherry Studio、ChatBox、LobeChat 等通用聊天客户端也都支持自定义 OpenAI 端点，填 Base URL + API Key + 模型名即可，思路与上表一致。

## 通用要点

接入任何工具前：

1. 在控制台创建 API Key（见[快速开始](/guide/quickstart)）。
2. 确认模型名：以 `GET /v1/models` 返回的 ID 为准，**工具里必须逐字一致**（这是接入失败的头号原因）。
3. Base URL 统一为 `https://api.tokenmp.cn/v1`（OpenAI 系工具）；Anthropic 系工具填 `https://api.tokenmp.cn`（客户端自动拼 `/v1/messages`）。

工具内填写的 `max_tokens` 会参与配额预留（见[计费说明](/guide/billing)），建议按需设置避免超额预留。
