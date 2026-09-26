import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

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

export default app;
