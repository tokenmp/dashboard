# ![](/logos/workbuddy.svg) WorkBuddy

腾讯全场景 AI 办公 Agent 桌面端，与 CodeBuddy 同家族（[官方网站](https://www.workbuddy.cn)）。
::: info 未实测
GUI 程序，本文内容来自官方文档（workbuddy.cn），未在本站实测。
:::

腾讯全场景 AI 办公 Agent 桌面端（与 CodeBuddy 同家族）。支持自定义模型，**仅支持 OpenAI 兼容协议**。

## 安装

从[官网](https://www.workbuddy.cn)下载安装桌面端，使用腾讯账号登录。
## 配置步骤

**设置 → 模型 → 添加 → 自定义**：

1. **接口地址**填 `https://api.tokenmp.cn/v1/chat/completions`（WorkBuddy 按标准 OpenAI 路径请求，默认模式会自动校验/补全 URL）。
2. **API Key** 填 TokenMP 的 Key（仅本地存储）。
3. **模型名称**填网关模型名（如 `mimo-v2.5`），或从自动拉取的列表选择。
4. 保存。

配置持久化在本地 `workbuddy/models.json`（旧版本路径 `~/.codebuddy/models.json` 仍兼容）。

## 「自定义协议」开关

高级设置里有**自定义协议**开关：

- **关**（默认）：自动校验并补全 URL，按标准 `/chat/completions` 路径请求——TokenMP 用标准路径，**无需开启**。
- **开**：直接向输入的完整 URL 发请求，跳过路径校验——仅当网关路径非标准时使用。

## 常见问题

- URL 自动补全可能改写地址，报 404 时检查最终请求路径是否符合 `.../v1/chat/completions`。
- Key 明文存在本地 models.json，共享环境注意保护。
- 不支持 Anthropic 原生 `/v1/messages`——TokenMP 账号直接用 OpenAI 端点即可，无需额外配置。
- 别与配置界面的「Token Plan / Coding Plan」混淆，那些是腾讯自家套餐体系，与自定义 API 无关。

## 信息来源

- 官方文档：[WorkBuddy 模型配置](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Model)、[WorkBuddy 概览](https://www.workbuddy.cn/docs/workbuddy/Overview)
- 交叉印证：[apiyii 接入指南](https://docs.apiyi.com/en/scenarios/chat/workbuddy)
- 未实测（GUI），以官方文档为准
