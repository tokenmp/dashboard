# Chat Completions

```
POST /v1/chat/completions
```

OpenAI Chat Completions 协议全兼容端点。请求体除少数由网关处理的字段外**原样透传**上游（`temperature`、`tools`、`tool_choice`、`response_format` 等均按 OpenAI 规范传递）。

::: tip
先看[接口总览](/api/endpoints)了解鉴权方式与通用错误码。
:::

## 请求

```bash
curl https://api.tokenmp.cn/v1/chat/completions \
  -H "Authorization: Bearer $TOKENMP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [
      { "role": "system", "content": "你是一个简洁的助手" },
      { "role": "user", "content": "用一句话介绍 TokenMP" }
    ],
    "max_tokens": 512
  }'
```

### 网关处理的字段

| 字段 | 说明 |
| --- | --- |
| `model` | **必填**。支持[模型选择器语法](#模型选择器) |
| `stream` | 决定流式 / 非流式响应 |
| `max_tokens` / `max_completion_tokens` | 必须为正整数，且不超过模型上限；用于配额预留估算 |

其余字段（含多模态 `image_url` 内容）原样透传。带图片输入时模型必须具备 `vision` 能力，否则返回 `MODEL_IMAGE_INPUT_UNSUPPORTED`。

### 模型选择器

`model` 字段支持更精确的路由控制：

```
<model>[:<route-group>][@<provider>]
```

| 写法 | 含义 |
| --- | --- |
| `mimo-v2.5` | 默认路由（自动选可用上游） |
| `mimo-v2.5:premium` | 指定路由组（如高优先级通道） |
| `mimo-v2.5@mimo-sgp` | 指定供应商 |
| `auto` | 自动模型：按你配置的主模型与备选列表路由，失败自动切换 |

## 响应

与 OpenAI 响应格式一致：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "mimo-v2.5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "……" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 24,
    "completion_tokens": 31,
    "total_tokens": 55
  }
}
```

::: warning
`model` 字段返回的是**上游实际模型名**（平台模型名可能配置了上游映射）。
:::

## 流式响应

`stream: true` 时返回 SSE（`text/event-stream`），事件格式与 OpenAI 一致（`chat.completion.chunk`）。

**无需传 `stream_options.include_usage`**——网关会自动注入，保证流的末尾带一个含 `usage` 的 chunk（`choices` 为空数组），便于精确对账：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[]...,"usage":{"prompt_tokens":24,"completion_tokens":31,"total_tokens":55}}

data: [DONE]
```

异常情况：

- 上游提前断流且网关已聚合到用量时，会**自动补写 `data: [DONE]`**，客户端无需特殊处理。
- 流中途出错时，网关追加一个错误事件（`"type":"upstream_error"`，choices 的 `finish_reason` 为 `"error"`），随后结束流。

## 跨协议降级

当默认路由的上游全部不可用时，网关会自动将请求**转换为 Anthropic Messages 或 OpenAI Responses 协议**重试其他上游，响应会转换回 OpenAI 格式（`id` 以 `chatcmpl-converted` 开头可识别）。

降级转换中**会丢失**的字段：`frequency_penalty`、`presence_penalty`、`logprobs`、`seed`、`n`、`response_format`、多模态图片内容（转为纯文本）。核心字段（`messages`、`tools`、`tool_choice`、`temperature`、`top_p`、`stop`、`max_tokens`、reasoning 内容）会保留。

不需要降级的常规请求不受影响。

## 信息来源

- 实现依据：executor 仓库 `internal/executor/protocols/chat/`（请求处理）、`protocols/streaming.go`（SSE 透传与 usage 注入）、`protocols/convert/conversion_openai_anthropic.go`（跨协议降级字段映射）
- 行为核对：2026-08-15 对照线上网关实测
