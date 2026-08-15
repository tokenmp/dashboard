# 接口总览

所有端点位于 `/v1` 下，鉴权方式两种任选：

```http
Authorization: Bearer <你的 API Key>
```

```http
x-api-key: <你的 API Key>
```

::: tip
公开站 `/api/v1/site/*`（模型、套餐、供应商信息）无需鉴权，供 landing 页面使用，不在本文档范围内。
:::

## 模型列表

```
GET /v1/models
```

返回当前账号可用的模型列表（含上下文窗口、能力标签等）。OpenAI 兼容格式。

## Chat Completions（OpenAI 协议）

```
POST /v1/chat/completions
```

OpenAI `/v1/chat/completions` 全兼容，含流式与跨协议降级。**详细文档 → [Chat Completions](/api/chat-completions)**

## Messages（Anthropic 协议）

```
POST /v1/messages
```

Anthropic `/v1/messages` 兼容端点，Anthropic SDK 设置 `baseURL` 指向网关即可。**详细文档 → [Messages](/api/messages)**

## Responses（OpenAI Responses 协议）

```
POST /v1/responses
```

OpenAI 新版 Responses 协议端点。**详细文档 → [Responses](/api/responses)**

## 通用行为

### 模型选择器

三个对话端点的 `model` 字段均支持 `模型名[:路由组][@供应商]` 选择器语法与 `auto` 自动模型，详见 [Chat Completions → 模型选择器](/api/chat-completions#模型选择器)。

### 跨协议降级

默认路由上游全部不可用时，网关自动把请求转换为其他协议重试（OpenAI Chat ↔ Anthropic Messages ↔ OpenAI Responses），响应转换回客户端请求的协议格式。各端点降级时保留 / 丢弃的字段清单见对应文档页。

### 错误码

错误响应统一为 OpenAI 风格：`{"error":{"message","type","code"}}`（`code` 可能为空）。下表覆盖 `/v1` 端点全部用户可见错误码，按来源分组。

**平台侧错误（网关直接返回）**

| HTTP | code | 含义与处理 |
| --- | --- | --- |
| 400 | `INVALID_PARAM` | 请求参数不合法：JSON 解析失败、`model` 缺失、选择器语法错误、`max_tokens` 非正整数 |
| 400 | `MODEL_IMAGE_INPUT_UNSUPPORTED` | 模型不支持图片输入，换视觉模型或移除图片 |
| 400 | `UNSUPPORTED_STREAM_CONVERSION` | 当前降级路由不支持该流式协议转换 |
| 401 | `UNAUTHORIZED`（可能无 code） | API Key 缺失、无效或已停用 |
| 402 | `QUOTA_EXCEEDED` | 套餐额度或余额不足，充值或兑换后重试 |
| 404 | `MODEL_NOT_FOUND` | 模型不存在，检查模型名 |
| 404 | `ROUTE_GROUP_NOT_FOUND` | 路由组不存在，检查 `model:group` 的 `group` |
| 404 | `PROVIDER_NOT_FOUND` | 供应商不存在，检查 `model@provider` 的 `provider` |
| 404 | （无 code） | 模型未配置或不可用 |
| 429 | `RATE_LIMITED` | 触发限流（请求频率 / 客户端频繁取消风控），按 `Retry-After` 头等待 |
| 499 | `CLIENT_CANCELED` | 客户端断开连接或主动取消 |
| 500 | `INTERNAL_ERROR` | 网关内部错误，可重试 |
| 502 | `NO_AVAILABLE_UPSTREAM` | 所有路由（含跨协议降级）均不可用 |
| 502 | `NO_LEASE_CAPACITY` | 上游并发容量耗尽，稍后重试 |
| 503 | `SERVICE_RESTARTING` | 服务重启 / 维护中，按 `Retry-After` 头重试 |

**上游通道错误（网关已尝试候选路由后仍失败才返回）**

| HTTP | code | 含义与处理 |
| --- | --- | --- |
| 400 | `UPSTREAM_INVALID_REQUEST` | 上游判定请求参数非法 |
| 400 | `UPSTREAM_CONTEXT_LENGTH_EXCEEDED` | 输入内容或 `max_tokens` 超过模型上下文限制 |
| 400 | `UPSTREAM_IMAGE_FORMAT_INVALID` | 图片格式不支持或无法解码（jpg/png/webp/gif + 有效 base64） |
| 400 | `UPSTREAM_REASONING_STATE_REQUIRED` | thinking 模式要求回传上一轮思考状态 |
| 400 | `UPSTREAM_CONTENT_BLOCKED` | 内容触发上游安全策略 |
| 400 | `UPSTREAM_DUPLICATE_REQUEST` | 上游判定重复请求 |
| 429 | `UPSTREAM_RATE_LIMITED` | 上游通道限流（网关已自动切换其他路由，全部命中才返回） |
| 5xx | `UPSTREAM_TIMEOUT` / `UPSTREAM_OVERLOADED` | 上游超时 / 过载，稍后重试 |
| 5xx | `UPSTREAM_ERROR` / `UPSTREAM_HTTP_ERROR` / `UPSTREAM_STREAM_ERROR` | 上游异常兜底（非流式 / HTTP / 流式） |

**通道配置类错误**（`UPSTREAM_AUTH_INVALID`、`UPSTREAM_PERMISSION_DENIED`、`UPSTREAM_QUOTA_EXCEEDED`、`UPSTREAM_BILLING_REQUIRED`、`UPSTREAM_PLAN_EXPIRED`、`UPSTREAM_PLAN_MODEL_DENIED`、`UPSTREAM_MODEL_NOT_FOUND`、`UPSTREAM_MODEL_NOT_SUPPORTED`）：HTTP 状态以上游返回为准，通常表示平台侧供应商配置异常而非你的请求问题——请[联系我们](/guide/contact)处理。

**重试建议**：`RATE_LIMITED`、`UPSTREAM_RATE_LIMITED`、`UPSTREAM_TIMEOUT`、`UPSTREAM_OVERLOADED`、`NO_LEASE_CAPACITY`、`SERVICE_RESTARTING`、上游 5xx 兜底码适合指数退避重试；`INVALID_PARAM`、`MODEL_NOT_FOUND`、`QUOTA_EXCEEDED`、`UPSTREAM_CONTEXT_LENGTH_EXCEEDED` 等请求类错误重试无意义，需先修正请求或额度。

::: tip
控制台兑换码相关错误（`REDEEM_CODE_INACTIVE` / `EXPIRED` / `EXHAUSTED` / `ALREADY_REDEEMED` / `PLAN_DOWNGRADE`）只出现在控制台兑换流程，不会从 `/v1` API 返回。
:::

## 图片生成

```
POST /v1/images/generations
```

OpenAI Images 协议兼容端点，支持智谱等图像上游。

## 信息来源

- 实现依据：executor 仓库 `cmd/executor/routes.go`（路由注册）、`internal/errorcodes/`（codes.go 错误码定义 / messages.go 公开文案 / metadata.go 分类与重试建议）
- 行为核对：2026-08-15 对照线上网关实测
