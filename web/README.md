# web/

React 前端源码目录。由 Vite 构建，产物输出到项目根的 `public/static/`。

## 常用命令（在本目录下执行）

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器（:5173，自动代理 /api 到 ThinkPHP :8000）
npm run build      # 生产构建（输出到 ../public/static）
npm run lint       # 代码检查
```

后端用 `php think run`（在项目根目录执行），详见根目录 README。
