# 快速开始

三步完成接入：注册 → 创建 API Key → 替换 base_url。

## 1. 注册账号

打开控制台首页，点击「注册」，填写邮箱与密码即完成（注册后自动登录）。

## 2. 创建 API Key

1. 登录控制台，进入「API Key」页面。
2. 点击「新建 Key」，为 Key 命名（便于区分用途）。
3. 复制生成的 Key。**Key 只在创建时完整展示一次，请妥善保存。**

## 3. 发起第一次请求

网关兼容 OpenAI 协议，任何 OpenAI SDK 只需替换 `baseURL`：

::: code-group

```ts [TypeScript / openai]
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: '你的 API Key',
  baseURL: 'https://api.tokenmp.cn/v1',
})

const res = await client.chat.completions.create({
  model: 'mimo-v2.5',
  messages: [{ role: 'user', content: '你好' }],
})
console.log(res.choices[0].message.content)
```

```python [Python / openai]
from openai import OpenAI

client = OpenAI(
    api_key="你的 API Key",
    base_url="https://api.tokenmp.cn/v1",
)

res = client.chat.completions.create(
    model="mimo-v2.5",
    messages=[{"role": "user", "content": "你好"}],
)
print(res.choices[0].message.content)
```

```bash [curl]
curl https://api.tokenmp.cn/v1/chat/completions \
  -H "Authorization: Bearer 你的 API Key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

:::

Anthropic 协议客户端同样可用（`/v1/messages`），鉴权支持 `x-api-key` 或 `Authorization: Bearer` 两种请求头。

## 下一步

- [工具接入](/guide/tools/) —— Claude Code / OpenCode / Codex CLI / Trae 等工具一键配置
- [套餐与计费](/guide/plans) —— 套餐类型、周期与限额、计费倍率
- [API 参考](/api/endpoints) —— 全部可用端点

## 信息来源

- 请求示例于 2026-08-15 在线上网关实测通过（模型 `mimo-v2.5`）
