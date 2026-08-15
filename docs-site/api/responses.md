# Responses（OpenAI Responses 协议）

```
POST /v1/responses
```

OpenAI 新版 Responses 协议兼容端点，请求 / 响应格式与官方一致，参数原样透传上游。

## 请求

```bash
curl https://api.tokenmp.cn/v1/responses \
  -H "Authorization: Bearer $TOKENMP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "input": "用一句话介绍 TokenMP",
    "max_output_tokens": 512
  }'
```

### 网关处理的字段

| 字段 | 说明 |
| --- | --- |
| `model` | **必填**。支持[模型选择器语法](/api/chat-completions#模型选择器) |
| `stream` | 决定流式 / 非流式响应 |
| `max_output_tokens` | 正整数，不超过模型上限；用于配额预留估算 |

其余字段（`instructions`、`input` 数组、`tools`、`tool_choice`、`reasoning`、`previous_response_id` 等）原样透传。

## 响应

与 OpenAI Responses 格式一致，用量字段为 `input_tokens` / `output_tokens`：

```json
{
  "id": "resp_xxx",
  "object": "response",
  "model": "mimo-v2.5",
  "status": "completed",
  "output": [
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "……" }] }
  ],
  "usage": {
    "input_tokens": 24,
    "output_tokens": 31,
    "total_tokens": 55
  }
}
```

## 流式响应

`stream: true` 时返回 OpenAI Responses 标准事件流（`response.created` → `response.in_progress` → `response.output_item.added` → `response.output_text.delta` → … → `response.completed`）。

最终用量在 `response.completed` 事件的 `response.usage` 中。事件逐个透传上游，不改变事件语义。

异常情况：流中途出错时，网关会追加 Responses 格式的错误事件后结束流。

## 跨协议降级

默认路由上游全部不可用时，网关会自动转换为 **OpenAI Chat Completions 或 Anthropic Messages** 协议重试，响应转换回 Responses 格式。

转换中的兼容处理：

- `max_output_tokens` ↔ `max_tokens` 自动对应
- `instructions` 转为 system 消息
- `input` 数组中的 `function_call` / `function_call_output` / reasoning 项转换为对应协议的消息结构；reasoning 内容以加密引用形式携带，跨请求保持连续
- custom tool 会以 `responses_custom_` 前缀包装为 function tool

未列出的非核心参数可能丢失；需要严格语义时建议优先使用与上游一致的协议端点。

## 信息来源

- 实现依据：executor 仓库 `internal/executor/protocols/responses/`（请求处理）、`protocols/responses_stream_copy.go`（事件流转换）
- 行为核对：2026-08-15 对照线上网关实测（Codex CLI 0.147.0 经此端点跑通）
