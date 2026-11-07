<div align="center">

# React Hono Template

面向 Cloudflare 的多租户 SaaS 全栈模板。自带一套能跑起来的任务协作应用，用来把组织、项目、看板、订阅和 AI 这条链路走通。克隆之后，换成你自己的业务即可。

[![stars](https://img.shields.io/github/stars/poco-ai/react-hono-template?style=flat&logo=github&label=stars&color=1f6feb)](https://github.com/poco-ai/react-hono-template/stargazers)
[![version](https://img.shields.io/badge/version-0.0.1-f97316?style=flat)](https://github.com/poco-ai/react-hono-template)
[![demo](https://img.shields.io/badge/%E6%BC%94%E7%A4%BA-%E5%9C%A8%E7%BA%BF%E6%9F%A5%E7%9C%8B-7c3aed?style=flat)](https://react-hono-web.poco-ai.workers.dev)
[![docs](https://img.shields.io/badge/%E6%96%87%E6%A1%A3-%E6%9F%A5%E7%9C%8B%E6%96%87%E6%A1%A3-7c3aed?style=flat)](./docs/README.md)

<br/>

![React](https://img.shields.io/badge/React-19-087EA4?style=flat&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?style=flat&logo=hono&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat&logo=cloudflare&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-000000?style=flat&logo=drizzle&logoColor=C5F74F)

</div>

界面支持中文 / English，以及浅色、深色和跟随系统。

## 功能

- **组织与账号**：多租户工作区，owner / admin / member，邮件邀请；邮箱密码、邮箱验证码，可选 Google、GitHub 登录
- **任务协作**：项目内编号（`PROJ-123`）、状态、优先级、标签、负责人、截止日期；列表筛选、拖拽看板、批量编辑、CSV 导入导出
- **内容与附件**：Markdown 描述和评论，活动时间线，走 S3 协议的预签名直传
- **开放能力**：`sk_` API Key、按套餐限流、OpenAPI 文档、带签名的出站 Webhook
- **订阅**：Stripe 的 Free / Pro 配额；本地可以不开 Stripe，用模拟账单走完升级
- **AI 与 MCP**：组织数据上的流式对话，写操作需要确认；同一套能力暴露给 Claude、Cursor 等客户端

## 技术栈

| | |
| --- | --- |
| 前端 | React 19、Vite、TanStack Router / Query、Tailwind CSS v4、shadcn/ui |
| 后端 | Hono，运行在 Cloudflare Workers |
| 数据 | Cloudflare D1、Drizzle ORM |
| 认证 | better-auth |
| 校验 | Zod，API 和表单共用 `packages/shared` |
| 工程 | Bun、Turborepo、Biome |

## 快速开始

需要 [Bun](https://bun.sh) 1.4 及以上。

```sh
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars
bun run --cwd apps/api db:migrate:local
bun run dev
```

打开 <http://localhost:5173>。第一个注册的用户会成为平台管理员。API 在 `:8787`，页面上的 `/api` 会代理过去。

到这一步就可以在本地用起来：账单走模拟模式，附件在配好存储之前会返回 503，验证码和重置链接打在 Worker 控制台。接 MinIO、邮件、Stripe 或真实模型见 [本地开发](docs/本地开发.md)。

## 目录

```text
apps/api           Hono API，部署到 Cloudflare Workers
apps/web           React 单页应用，部署为 Workers 静态资源
packages/shared    前后端共用的 Zod schema、套餐限额、错误码
packages/ui        shadcn/ui 组件
docs               部署、环境变量、架构和生产说明
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `bun run dev` | 同时启动 API（:8787）和 Web（:5173） |
| `bun run test` | API 与 Web 回归测试 |
| `bun run lint` | Biome 检查 |
| `bun run typecheck` | 全仓类型检查 |
| `bun run build` | 构建 Web |

## 文档

| 文档 | 内容 |
| --- | --- |
| [本地开发](docs/本地开发.md) | 附件、邮件、社交登录、AI |
| [环境变量](docs/环境变量.md) | 全部配置项，本地和生产怎么放 |
| [部署](docs/部署.md) | 首次上线、CI、发布前检查 |
| [架构](docs/架构.md) | 目录、分层、加一个资源要动哪里 |
| [AI 与 MCP](docs/AI与MCP.md) | 对话、工具调用、远程 MCP |
| [生产说明](docs/生产说明.md) | 模板里故意留下的简化，以及对应的升级方向 |

线上示例：<https://react-hono-web.poco-ai.workers.dev> · API <https://react-hono-api.poco-ai.workers.dev>
