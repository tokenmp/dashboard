# ![](/logos/trae.png) Trae

字节跳动 AI IDE（[官方网站·国际版](https://www.trae.ai) · [国内版](https://www.trae.cn) · [文档](https://docs.trae.ai)）。
::: info 未实测
GUI 程序，本文内容来自官方文档（docs.trae.ai / docs.trae.cn）与官方社区教程，未在本站实测，版本界面可能与描述有差异。
:::

字节跳动 AI IDE（TraeCode）。v3.3.51 起支持自定义模型（更早版本不支持，先升级）。

## 安装

从[官网下载页](https://www.trae.ai/download)安装桌面端（支持 macOS / Windows），或使用国内版 [trae.cn](https://www.trae.cn)。

安装后确认版本 ≥ v3.3.51（自定义 Base URL 的最低版本要求）。
## 配置步骤

**Settings → Models → Add Model → Custom Configuration**：

1. 选择「自定义配置」（预设 Provider 列表里没有的网关都走这个）。
2. **API 格式**选 `OpenAI`（兼容性最好）或 `Anthropic`。
3. **Base URL**：
   - OpenAI 格式填 `https://api.tokenmp.cn/v1`（新版默认自动拼 `/chat/completions`，不要手动带后缀）
   - Anthropic 格式填 `https://api.tokenmp.cn/v1`
   - 仅当界面出现「完整 URL」开关且你想手写 `.../v1/chat/completions` 全路径时才打开它
4. **模型 ID**：填网关模型名（如 `mimo-v2.5`），必须与 `GET /v1/models` 返回**逐字一致**。
5. **API Key**：填 TokenMP 的 Key。
6. 可选：多模态开关、上下文窗口（输入+输出合计）、工具调用轮次。

保存时 Trae 会实际调用一次接口做连通性校验，失败会展示服务商返回的错误日志——排查时优先看这个日志。

## 常见问题

- **模型 ID 填错是失败的头号原因**，去[模型页](https://tokenmp.cn/models)逐字核对。
- 旧版本 Base URL 需手动带 `/chat/completions` 后缀，新版不带——升级后行为有变化，报 404 时先检查这里。
- 国内版（Trae CN）有社区报告称自定义模型请求会经 Trae 后端代理转发而非直连，介意直连请使用国际版。
- 上下文窗口不要虚标超过模型实际值，会导致输出质量严重劣化。

## 信息来源

- 官方文档：[Trae Models（国际版）](https://docs.trae.ai/ide/models)、[Trae 模型配置（国内版）](https://docs.trae.cn/ide_models)
- 官方社区教程：[自定义模型接入](https://forum.trae.cn/t/topic/11480)（2026-05 更新）、[版本差异讨论](https://forum.trae.cn/t/topic/11972)
- 功能请求记录：[GitHub Trae-AI/TRAE#1872](https://github.com/Trae-AI/TRAE/issues/1872)
- 未实测（GUI），以官方文档为准
