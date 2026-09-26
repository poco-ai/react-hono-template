import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle",
	schema: "./src/db/schema.ts",
	dialect: "sqlite",
	driver: "d1-http",
	// 只有 push/migrate 会真正连接远端 D1，generate 不需要
	dbCredentials: {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
		databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
		token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
	},
});
