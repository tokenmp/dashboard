import { defineConfig } from 'vitepress'

// 部署在主站子路径 /docs 下；将来切 docs 子域名时改为 '/' 并调整反代配置。
const BASE = '/docs/'

export default defineConfig({
  lang: 'zh-CN',
  title: 'TokenMP 文档',
  description: 'TokenMP 多协议模型网关：接入指南、计费倍率说明与 API 参考。',
  base: BASE,
  cleanUrls: true, // /guide/quickstart 而非 /guide/quickstart.html（openresty try_files 已兜底）
  srcExclude: ['README.md'], // README 是给开发者的，不进站点

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    // 与 landing 公开站同一颗蓝色（#2563eb），主题色覆盖见 theme/custom.css
    nav: [
      { text: '指南', link: '/guide/quickstart', activeMatch: '/guide/' },
      { text: '工具接入', link: '/guide/tools/', activeMatch: '/guide/tools/' },
      { text: 'API', link: '/api/endpoints', activeMatch: '/api/' },
      { text: '套餐与计费', link: '/guide/plans', activeMatch: '/guide/(plans|plan-cycles|billing)' },
      {
        text: '进入控制台',
        // 站外链接不加 base；域名定下来后替换为正式地址
        link: 'https://tokenmp.cn',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '快速开始', link: '/guide/quickstart' },
            { text: '联系我们', link: '/guide/contact' },
          ],
        },
        {
          text: '套餐与计费',
          items: [
            { text: '套餐类型与分组', link: '/guide/plans' },
            { text: '周期与限额', link: '/guide/plan-cycles' },
            { text: '计费倍率', link: '/guide/billing' },
          ],
        },
        {
          text: '工具接入',
          items: [
            { text: '工具总览', link: '/guide/tools/' },
            { text: 'Claude Code', link: '/guide/tools/claude-code' },
            { text: 'OpenCode', link: '/guide/tools/opencode' },
            { text: 'Codex CLI', link: '/guide/tools/codex' },
            { text: 'Trae', link: '/guide/tools/trae' },
            { text: 'WorkBuddy', link: '/guide/tools/workbuddy' },
            { text: 'OpenClaw', link: '/guide/tools/openclaw' },
            { text: 'Hermes Agent', link: '/guide/tools/hermes' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '接口总览', link: '/api/endpoints' },
            { text: 'Chat Completions', link: '/api/chat-completions' },
            { text: 'Messages（Anthropic）', link: '/api/messages' },
            { text: 'Responses', link: '/api/responses' },
          ],
        },
      ],
    },

    outline: { level: [2, 3] },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: true,
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    socialLinks: [{ icon: 'github', link: 'https://tokenmp.cn' }],
  },
})
