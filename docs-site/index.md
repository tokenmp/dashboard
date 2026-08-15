---
layout: home

hero:
  name: TokenMP
  text: 多协议模型网关
  tagline: 一个 API Key 接入多家上游模型，OpenAI / Anthropic 协议兼容，按倍率透明计费。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 查看模型与倍率
      link: /guide/billing

features:
  - icon: 🔑
    title: 一个 Key，全部模型
    details: 在控制台创建 API Key 后即可调用所有已上架模型，模型路由与上游映射由网关自动完成。
  - icon: 🔀
    title: 多协议兼容
    details: 同时支持 OpenAI（/v1/chat/completions、/v1/responses）与 Anthropic（/v1/messages）协议，现有 SDK 换个 base_url 即可迁移。
  - icon: 📊
    title: 透明倍率计费
    details: 每个模型公开计费倍率，支持小数倍率与时间段差异化定价，账单明细可在控制台逐笔核对。
  - icon: ⏱️
    title: 灵活套餐限额
    details: 按周期、滚动 5 小时窗口等多维度限额，超限自动熔断，保护预算不失控。
---

<!-- features 的 icon 如需去掉 emoji 换线性图标，改用 SVG 自定义组件，与 landing 约束保持一致 -->
