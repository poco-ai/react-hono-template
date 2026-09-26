import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		proxy: {
			// 本地开发时把 /api 请求转发到 wrangler dev 启动的 Hono API（apps/api）
			// 这样浏览器里是同源请求，本地开发不需要 CORS
			"/api": "http://localhost:8787",
		},
	},
});
