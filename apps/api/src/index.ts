import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { usersTable } from "./db/schema";

// Env（含 DB: D1Database）由 `wrangler types` 生成的 worker-configuration.d.ts 提供
const app = new Hono<{ Bindings: Env }>();

// 前后端不同域名，需要 CORS。本地开发走 Vite 代理（localhost:5173），
// 生产环境是前端 Worker 的域名。
app.use(
	"/api/*",
	cors({
		origin: [
			"http://localhost:5173", // Vite 本地开发
			"https://react-hono-web.chenqiyuan1012.workers.dev", // 生产前端
		],
	}),
);

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.get("/api/hello", (c) => {
	return c.json({ message: "Hello from Workers API!" });
});

app.get("/api/users", async (c) => {
	const db = drizzle(c.env.DB);
	const result = await db.select().from(usersTable).all();
	return c.json(result);
});

export default app;
