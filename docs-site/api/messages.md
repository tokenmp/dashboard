# Messages（Anthropic 协议）

```
POST /v1/messages
```

Anthropic Messages 协议兼容端点。Anthropic SDK 只需把 `baseURL` 指向网关：

```ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: '你的 API Key',
  baseURL: 'https://api.tokenmp.cn',
})
```

## 请求

```bash
curl https://api.tokenmp.cn/v1/messages \
  -H "x-api-key: $TOKENMP_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "max_tokens": 512,
    "system": "你是一个简洁的助手",
    "messages": [
      { "role": "user", "content": "用一句话介绍 TokenMP" }
    ]
  }'
```

### 网关处理的字段

| 字段 | 说明 |
| --- | --- |
| `model` | **必填**。支持[模型选择器语法](/api/chat-completions#模型选择器) |
| `stream` | 决定流式 / 非流式响应 |
| `max_tokens` | **必填**（Anthropic 协议本身要求）。正整数，不超过模型上限 |

其余字段（`system`、`tools`、`tool_choice`、`thinking`、多模态内容等）原样透传。

两个网关的兼容性处理（对客户端透明）：

- 混在 `messages` 里的 `system` 角色消息会被提取合并到顶层 `system` 字段（部分非标准客户端会这样发）。
- 带 `tool_use` 的 assistant 消息会自动补齐空 `thinking` 块，满足严格上游校验。

## 响应

与 Anthropic 响应格式一致：

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "……" }],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 24,
    "output_tokens": 31
  }
}
```

## 流式响应

`stream: true` 时返回 Anthropic 标准事件流：

```
event: message_start
data: {"type":"message_start","message":{...,"usage":{"input_tokens":24,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":24,"output_tokens":31}}

event: message_stop
data: {"type":"message_stop"}
```

最终用量以 `message_delta` 事件的 `usage` 为准。thinking 模型会额外出现 `thinking` 类型的 `content_block_*` 事件与 `thinking_delta`。

异常情况：流中途出错时，网关追加 `event: error` 事件（`{"type":"error","error":{"message":...,"type":...}}`）后结束流。

## 错误格式注意

::: warning
**非流式错误统一为 OpenAI 风格** `{"error":{"message","type","code"}}`，而非 Anthropic 的 `{"type":"error","error":{...}}` 包装。Anthropic SDK 对此的解析可能降级为通用错误，排查时建议直接看响应体。只有流式转换场景的 in-stream 错误事件才用 Anthropic 格式。
:::

## 跨协议降级

默认路由上游全部不可用时，网关会自动转换为 **OpenAI Chat Completions 或 OpenAI Responses** 协议重试，响应转换回 Anthropic 格式（`id` 以 `msg_converted` 开头可识别）。

降级转换中**会丢失**的字段：`metadata`、`top_k`、`cache_control`、非 base64 的图片源。核心字段（`system`、`messages`、`tools`、`tool_choice`、`temperature`、`top_p`、`stop_sequences`、`max_tokens`、thinking 内容、base64 图片）会保留；`cache_read_input_tokens` 在转换响应中不可用。

## 信息来源

- 实现依据：executor 仓库 `internal/executor/protocols/messages/`（请求处理与 system 提取）、`protocols/streaming.go`（事件流与 in-stream 错误）、`protocols/compat_helpers.go`（统一错误格式）
- 行为核对：2026-08-15 对照线上网关实测
