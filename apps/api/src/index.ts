import { env } from "cloudflare:workers";
import { ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db";
import { createAuth } from "./lib/auth";
import { fail } from "./lib/response";
import { createRoutes } from "./routes";

// 组合根（Composition Root）：整个应用唯一允许触碰 env 的地方。
// db、auth、业务路由都在这里装配，其余模块只接收注入的依赖。
// Env 类型由 `wrangler types` 生成的 worker-configuration.d.ts 提供。

const trustedOrigins = [
	"http://localhost:5173", // Vite 本地开发
	"https://react-hono-web.chenqiyuan1012.workers.dev", // 生产前端
];

const app = new Hono<{ Bindings: Env }>();

// 前后端不同域名，需要 CORS。本地开发走 Vite 代理（localhost:5173），
// 生产环境是前端 Worker 的域名。
app.use("/api/*", cors({ origin: trustedOrigins }));

// 业务路由：统一 ApiResult 返回 + 统一异常处理（见 routes.ts）
app.route("/", createRoutes(db));

// Better Auth：独立协议，前端用 better-auth/client 访问，不参与 Hono RPC
const auth = createAuth({
	db,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins,
});
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// 注意：子应用（createRoutes）的 onError 会随 route() 挂载生效，
// 但 notFound 不会 —— 未匹配路由走父应用的 notFound，所以统一 404 响应注册在这里
app.notFound((c) => fail(c, ApiErrorCode.NOT_FOUND, "Route not found", 404));

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

export default app;
